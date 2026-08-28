-- Weekly practices had to be created one at a time. Adds a lightweight
-- recurrence grouping: series_id points at the first ("anchor") event in a
-- recurring batch, so later occurrences can be found/cancelled together
-- without a full RRULE model — this club only ever needs "same day/time,
-- every week, for N weeks."
alter table events add column if not exists series_id uuid references events(id) on delete set null;

create or replace function create_targeted_event(
  p_club_id uuid,
  p_type text,
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_notes text,
  p_team_id uuid,
  p_player_ids uuid[],
  p_series_id uuid default null
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

  insert into events (club_id, team_id, type, title, location, starts_at, notes, created_by, series_id)
  values (p_club_id, p_team_id, p_type, p_title, p_location, p_starts_at, p_notes, auth.uid(), p_series_id)
  returning id into v_event_id;

  -- First occurrence in a new series becomes its own anchor.
  if p_series_id is null then
    update events set series_id = v_event_id where id = v_event_id;
  end if;

  if p_player_ids is not null and array_length(p_player_ids, 1) > 0 then
    insert into event_players (event_id, player_id, club_id)
    select v_event_id, pid, p_club_id from unnest(p_player_ids) pid;
  end if;

  return v_event_id;
end;
$$;

grant execute on function create_targeted_event(uuid, text, text, text, timestamptz, text, uuid, uuid[], uuid) to authenticated;
