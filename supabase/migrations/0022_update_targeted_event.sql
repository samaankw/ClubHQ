-- Companion to create_targeted_event(): lets a director, the event's
-- creator, or a coach assigned to the (new) team edit an event, including
-- changing its team/player targeting. event_players has no insert/update/
-- delete RLS policy (see 0021) — rows are only ever written here, via this
-- security-definer function, which re-validates permissions itself rather
-- than relying on RLS.
create or replace function update_targeted_event(
  p_event_id uuid,
  p_type text,
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_notes text,
  p_team_id uuid,
  p_player_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_created_by uuid;
  v_is_director boolean;
  v_authorized boolean;
begin
  select club_id, created_by into v_club_id, v_created_by from events where id = p_event_id;
  if v_club_id is null then
    raise exception 'Event not found';
  end if;
  if v_club_id <> current_user_club() then
    raise exception 'Not authorized for this club';
  end if;

  select exists (select 1 from profiles where id = auth.uid() and role = 'director' and club_id = v_club_id) into v_is_director;
  v_authorized := v_is_director or v_created_by = auth.uid();

  if not v_authorized and p_team_id is not null then
    v_authorized := exists (select 1 from team_coaches where team_id = p_team_id and coach_id = auth.uid());
  end if;
  if not v_authorized then
    raise exception 'Not authorized to edit this event';
  end if;

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
    raise exception 'Only directors can make an event club-wide';
  end if;

  update events set
    type = p_type,
    title = p_title,
    location = p_location,
    starts_at = p_starts_at,
    notes = p_notes,
    team_id = p_team_id
  where id = p_event_id;

  delete from event_players where event_id = p_event_id;
  if p_player_ids is not null and array_length(p_player_ids, 1) > 0 then
    insert into event_players (event_id, player_id, club_id)
    select p_event_id, pid, v_club_id from unnest(p_player_ids) pid;
  end if;
end;
$$;

grant execute on function update_targeted_event(uuid, text, text, text, timestamptz, text, uuid, uuid[]) to authenticated;
