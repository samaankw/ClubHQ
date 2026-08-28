-- 0020 added events.player_id for a single private-session target, but a
-- coach sometimes trains two players of different ages in the very same
-- session — a single nullable FK can't represent that. Replace it with a
-- join table (mirrors announcement_player_targets) so a "Private Session"
-- can target one or several specific players at once.
drop policy if exists "events_read" on events;
drop policy if exists "events_write" on events;
drop policy if exists "events_update" on events;

alter table events drop constraint if exists events_single_target;
alter table events drop column if exists player_id;

create table if not exists event_players (
  id uuid primary key default extensions.uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  -- Denormalized rather than joined from events: events_read below needs to
  -- query event_players (so a parent can see a session their child is in),
  -- and if event_players' own policy queried back into events for its
  -- is_club_staff check, Postgres throws "infinite recursion detected in
  -- policy" — hit this exact shape once already with
  -- announcements/announcement_player_targets (see 0015). Storing club_id
  -- directly here keeps event_players' RLS one-directional.
  club_id uuid not null references clubs(id) on delete cascade,
  unique (event_id, player_id)
);
alter table event_players enable row level security;

create policy "event_players_read" on event_players for select using (
  is_club_staff(club_id)
  or exists (select 1 from players pl where pl.id = event_players.player_id and pl.parent_id = auth.uid())
);

-- No insert/update/delete policies: rows are only ever written by
-- create_targeted_event() below, which runs security definer (so it isn't
-- subject to — or blocked by — this table's RLS) and re-validates the
-- caller's permissions itself before writing anything.

create policy "events_read" on events for select using (
  is_club_staff(club_id)
  or (
    club_id = current_user_club()
    and (
      (team_id is null and not exists (select 1 from event_players ep where ep.event_id = events.id))
      or exists (select 1 from players pl where pl.team_id = events.team_id and pl.parent_id = auth.uid())
      or exists (
        select 1 from event_players ep
        join players pl on pl.id = ep.player_id
        where ep.event_id = events.id and pl.parent_id = auth.uid()
      )
    )
  )
);

-- A coach could always update a team event they were assigned to, but never
-- had a path to update a private session they themselves created — add that.
create policy "events_update" on events for update using (
  club_id = current_user_club()
  and (
    created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director')
    or exists (select 1 from team_coaches tc where tc.team_id = events.team_id and tc.coach_id = auth.uid())
  )
) with check (
  club_id = current_user_club()
  and (
    created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director')
    or exists (select 1 from team_coaches tc where tc.team_id = events.team_id and tc.coach_id = auth.uid())
  )
);

-- Restores the 0010 shape (team-only, or director for anything) now that
-- the player_id branch 0020 added is gone. Private and semi-private
-- sessions (team_id null, one or more specific players) are created
-- exclusively through create_targeted_event() below instead, so "only a
-- director can create a true club-wide event" stays enforced even though
-- the event row and its event_players rows are two separate inserts — the
-- function validates every selected player belongs to a team the calling
-- coach coaches (or lets a director target anyone) before writing either
-- row.
create policy "events_write" on events for insert with check (
  created_by = auth.uid()
  and club_id = current_user_club()
  and (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director')
    or (
      team_id is not null
      and exists (select 1 from team_coaches tc where tc.team_id = events.team_id and tc.coach_id = auth.uid())
    )
  )
);

create or replace function create_targeted_event(
  p_club_id uuid,
  p_type text,
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_notes text,
  p_team_id uuid,
  p_player_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_is_director boolean;
begin
  if p_club_id <> current_user_club() then
    raise exception 'Not authorized for this club';
  end if;

  select exists (select 1 from profiles where id = auth.uid() and role = 'director' and club_id = p_club_id) into v_is_director;

  if p_team_id is not null then
    if not v_is_director and not exists (select 1 from team_coaches where team_id = p_team_id and coach_id = auth.uid()) then
      raise exception 'Not authorized for this team';
    end if;
  elsif p_player_ids is not null and array_length(p_player_ids, 1) > 0 then
    if not v_is_director and exists (
      select 1 from unnest(p_player_ids) pid
      where not exists (
        select 1 from players pl
        join team_coaches tc on tc.team_id = pl.team_id
        where pl.id = pid and tc.coach_id = auth.uid()
      )
    ) then
      raise exception 'Not authorized for one or more selected players';
    end if;
  elsif not v_is_director then
    raise exception 'Only directors can create club-wide events';
  end if;

  insert into events (club_id, team_id, type, title, location, starts_at, notes, created_by)
  values (p_club_id, p_team_id, p_type, p_title, p_location, p_starts_at, p_notes, auth.uid())
  returning id into v_event_id;

  if p_player_ids is not null and array_length(p_player_ids, 1) > 0 then
    insert into event_players (event_id, player_id, club_id)
    select v_event_id, pid, p_club_id from unnest(p_player_ids) pid;
  end if;

  return v_event_id;
end;
$$;

grant execute on function create_targeted_event(uuid, text, text, text, timestamptz, text, uuid, uuid[]) to authenticated;
