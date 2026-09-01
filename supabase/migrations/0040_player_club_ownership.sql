-- Phase 6a: players.club_id as the authoritative tenancy column.
--
-- Today a player's club is derived by joining through teams (players.team_id
-- -> teams.club_id). That makes a teamless player -- the entire point of
-- letting a private trainer or academy operate without fake per-age-group
-- teams -- structurally invisible: every join returns zero rows for a null
-- team_id, so RLS denies, RPCs raise "not authorized," and
-- app/modals/add-player.tsx's own empty state says outright "a player has to
-- belong to a team." This migration makes club_id authoritative and required,
-- keeps team_id optional, and adds a trigger enforcing that when a team_id IS
-- present, it must actually belong to the same club.

-- ---------------------------------------------------------------------------
-- 1. Add the column, backfill, then require it.
-- ---------------------------------------------------------------------------

alter table players add column if not exists club_id uuid references clubs(id);

update players set club_id = t.club_id
from teams t
where players.team_id = t.id and players.club_id is null;

do $$
declare
  v_unresolved int;
begin
  select count(*) into v_unresolved from players where club_id is null;
  if v_unresolved > 0 then
    raise exception 'players.club_id backfill left % row(s) unresolved -- a player exists with no team_id and no way to derive club_id. Resolve manually before this migration can proceed.', v_unresolved;
  end if;
end $$;

alter table players alter column club_id set not null;

create index if not exists players_club_id_idx on players (club_id);

-- ---------------------------------------------------------------------------
-- 2. Consistency trigger: when team_id is set, it must belong to the same
-- club as club_id. Not expressible as a plain check constraint (needs a
-- cross-table lookup), so a trigger it is.
-- ---------------------------------------------------------------------------

create or replace function enforce_player_team_club_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.team_id is not null then
    if not exists (select 1 from teams where id = new.team_id and club_id = new.club_id) then
      raise exception 'players.team_id (%) does not belong to players.club_id (%)', new.team_id, new.club_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists players_team_club_consistency on players;
create trigger players_team_club_consistency
before insert or update of team_id, club_id on players
for each row execute function enforce_player_team_club_consistency();

-- ---------------------------------------------------------------------------
-- 3. RLS: read players.club_id directly instead of joining through teams.
-- Every one of these denied/emptied for a teamless player before this
-- migration; all ten are simpler now, not just teamless-compatible, since
-- club_id no longer needs a join to resolve at all.
-- ---------------------------------------------------------------------------

alter policy "players_read" on public.players
  using ((parent_id = (select auth.uid())) or is_club_staff(club_id));

alter policy "players_insert_staff" on public.players
  with check (exists (
    select 1 from profiles p
    where p.id = (select auth.uid()) and p.club_id = players.club_id and p.role = 'director'
  ));

alter policy "players_update_staff" on public.players
  using (exists (
    select 1 from profiles p
    where p.id = (select auth.uid()) and p.club_id = players.club_id and p.role = 'director'
  ))
  with check (exists (
    select 1 from profiles p
    where p.id = (select auth.uid()) and p.club_id = players.club_id and p.role = 'director'
  ));

alter policy "players_delete_director" on public.players
  using (exists (
    select 1 from profiles p
    where p.id = (select auth.uid()) and p.club_id = players.club_id and p.role = 'director'
  ));

alter policy "evaluations_read" on public.evaluations
  using (exists (
    select 1 from players pl
    where pl.id = evaluations.player_id
      and (pl.parent_id = (select auth.uid()) or is_club_staff(pl.club_id))
  ));

alter policy "evaluations_write" on public.evaluations
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from players pl where pl.id = evaluations.player_id and is_club_staff(pl.club_id))
  );

alter policy "dev_plans_read" on public.development_plans
  using (exists (
    select 1 from players pl
    where pl.id = development_plans.player_id
      and (is_club_staff(pl.club_id) or (pl.parent_id = (select auth.uid()) and development_plans.status = 'published'))
  ));

alter policy "homework_read" on public.homework_items
  using (exists (
    select 1 from players pl
    join development_plans dp on dp.id = homework_items.development_plan_id
    where pl.id = homework_items.player_id
      and (is_club_staff(pl.club_id) or (pl.parent_id = (select auth.uid()) and dp.status = 'published'))
  ));

alter policy "parent_link_codes_director_read" on public.parent_link_codes
  using (exists (
    select 1 from players pl
    join profiles p on p.id = (select auth.uid())
    where pl.id = parent_link_codes.player_id and p.club_id = pl.club_id and p.role = 'director'
  ));

alter policy "report_views_insert" on public.report_views
  with check (
    viewer_id = (select auth.uid())
    and exists (select 1 from players pl where pl.id = report_views.player_id and is_club_member(pl.club_id))
  );

-- ---------------------------------------------------------------------------
-- 4. RPCs: 4 that broke outright for a teamless player (read club_id
-- directly instead of joining through teams), plus 2 whose player-targeting
-- authorization only had a path through team_coaches -- widened so a
-- teamless player can be targeted by any staff member of their own club,
-- since there's no team-coach assignment to check for a client with no team.
-- Team-having players keep the exact same team_coaches-based check as before.
-- ---------------------------------------------------------------------------

create or replace function create_parent_link_code(p_player_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_club uuid;
  player_club uuid;
  new_code text;
begin
  select club_id into caller_club from profiles where id = auth.uid() and role = 'director';
  select club_id into player_club from players where id = p_player_id;
  if caller_club is null or player_club is distinct from caller_club then
    raise exception 'Only this club''s director can create a parent link code.';
  end if;

  new_code := upper(substr(md5(random()::text || clock_timestamp()::text || p_player_id::text), 1, 8));
  delete from parent_link_codes where player_id = p_player_id and claimed_at is null;
  insert into parent_link_codes (player_id, code, created_by) values (p_player_id, new_code, auth.uid());
  return new_code;
end;
$$;

create or replace function claim_parent_link_code(p_code text, p_confirm_parental_consent boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_club uuid;
  caller_role text;
  link parent_link_codes;
  player_club uuid;
begin
  if caller_id is null then raise exception 'Authentication required.'; end if;
  if not p_confirm_parental_consent then raise exception 'Parental consent confirmation is required.'; end if;

  select club_id, role into caller_club, caller_role from profiles where id = caller_id;
  if caller_role is distinct from 'parent' then raise exception 'Only parent accounts can claim a player.'; end if;

  select * into link from parent_link_codes
  where upper(code) = upper(trim(p_code)) and claimed_at is null and expires_at > now()
  limit 1;
  if link.id is null then raise exception 'Invalid or expired player link code.'; end if;

  select club_id into player_club from players where id = link.player_id;
  if caller_club is null or player_club is distinct from caller_club then
    raise exception 'Join the player''s club before claiming this code.';
  end if;

  update players set parent_id = caller_id where id = link.player_id;
  update parent_link_codes set claimed_by = caller_id, claimed_at = now() where id = link.id;

  insert into consent_records (user_id, player_id, consent_type, policy_version)
  values (caller_id, link.player_id, 'parental_data_consent', 'v2');

  return link.player_id;
end;
$$;

create or replace function review_development_plan(p_plan_id uuid, p_publish boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_club uuid;
  plan_club uuid;
  plan_coach uuid;
begin
  select role, club_id into caller_role, caller_club from profiles where id = caller_id;
  select pl.club_id, e.coach_id into plan_club, plan_coach
  from development_plans dp
  join players pl on pl.id = dp.player_id
  join evaluations e on e.id = dp.evaluation_id
  where dp.id = p_plan_id;

  if caller_club is null or plan_club is distinct from caller_club then raise exception 'Plan is not in your club.'; end if;
  if caller_role <> 'director' and plan_coach is distinct from caller_id then
    raise exception 'Only the evaluating coach or a director can review this plan.';
  end if;

  update development_plans
  set reviewed_by = caller_id,
      reviewed_at = now(),
      status = case when p_publish then 'published' else 'coach_reviewed' end,
      published_at = case when p_publish then now() else null end
  where id = p_plan_id;
end;
$$;

create or replace function delete_player_data(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_id uuid := auth.uid();
  is_parent boolean;
  is_director_of_club boolean;
begin
  select role into caller_role from profiles where id = caller_id;

  select exists (
    select 1 from players where id = p_player_id and parent_id = caller_id
  ) into is_parent;

  select exists (
    select 1 from players pl
    where pl.id = p_player_id and pl.club_id = (select club_id from profiles where id = caller_id)
      and caller_role = 'director'
  ) into is_director_of_club;

  if not (is_parent or is_director_of_club) then
    raise exception 'You are not authorized to delete this player''s data.';
  end if;

  delete from players where id = p_player_id;
end;
$$;

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
        where pl.id = pid
          and (
            (pl.team_id is not null and exists (select 1 from team_coaches tc where tc.team_id = pl.team_id and tc.coach_id = auth.uid()))
            or (pl.team_id is null and is_club_staff(pl.club_id))
          )
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

create or replace function update_targeted_event(
  p_event_id uuid,
  p_type text,
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_notes text,
  p_team_id uuid,
  p_player_ids uuid[],
  p_notify boolean default true
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
        where pl.id = pid
          and (
            (pl.team_id is not null and exists (select 1 from team_coaches tc where tc.team_id = pl.team_id and tc.coach_id = auth.uid()))
            or (pl.team_id is null and is_club_staff(pl.club_id))
          )
      )
    ) then
      raise exception 'Not authorized for one or more selected players';
    end if;
  elsif not v_is_director then
    raise exception 'Only directors can make an event club-wide';
  end if;

  perform set_config('clubhq.suppress_change_notice', case when p_notify then 'off' else 'on' end, true);

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
