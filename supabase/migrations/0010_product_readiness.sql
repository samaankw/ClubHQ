-- =========================================================
-- ClubHQ product-readiness layer
-- Adds the operational workflows around the existing player-development engine.
-- =========================================================

-- ---------- Soft archive for seasonal club operations ----------
alter table teams add column if not exists archived_at timestamptz;
alter table players add column if not exists archived_at timestamptz;

-- ---------- AI plan review / publication ----------
alter table development_plans
  add column if not exists status text not null default 'draft'
    check (status in ('draft','coach_reviewed','published','archived')),
  add column if not exists reviewed_by uuid references profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists published_at timestamptz;

-- Existing plans predate the review workflow. Keep them visible rather than hiding
-- historical reports after applying this migration.
update development_plans
set status = 'published', published_at = coalesce(published_at, created_at)
where status = 'draft' and reviewed_at is null and published_at is null;

-- ---------- Richer homework tracking ----------
alter table homework_items
  add column if not exists due_date date,
  add column if not exists parent_note text,
  add column if not exists coach_feedback text,
  add column if not exists difficulty text check (difficulty in ('easy','right_level','hard'));

-- ---------- Attendance ----------
create table if not exists attendance_records (
  event_id uuid not null references events(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  status text not null check (status in ('present','absent','late','excused')),
  notes text,
  marked_by uuid references profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

alter table attendance_records enable row level security;

-- ---------- Player-specific parent linking ----------
create table if not exists parent_link_codes (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid not null references players(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  claimed_by uuid references profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table parent_link_codes enable row level security;
alter table consent_records add column if not exists player_id uuid references players(id) on delete cascade;

-- ---------- Push-token foundation ----------
create table if not exists push_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text check (platform in ('ios','android','web')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

alter table push_tokens enable row level security;
create policy "push_tokens_self_read" on push_tokens for select using (user_id = auth.uid());
create policy "push_tokens_self_insert" on push_tokens for insert with check (user_id = auth.uid());
create policy "push_tokens_self_update" on push_tokens for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_tokens_self_delete" on push_tokens for delete using (user_id = auth.uid());

-- =========================================================
-- Privacy hardening: parents should not automatically see every child in a club.
-- Staff retain club-level access; parents see only linked children and published work.
-- =========================================================
drop policy if exists "players_read" on players;
create policy "players_read" on players for select using (
  parent_id = auth.uid()
  or exists (
    select 1 from teams t
    where t.id = players.team_id and is_club_staff(t.club_id)
  )
);

drop policy if exists "evaluations_read" on evaluations;
create policy "evaluations_read" on evaluations for select using (
  exists (
    select 1 from players pl
    join teams t on t.id = pl.team_id
    where pl.id = evaluations.player_id
      and (pl.parent_id = auth.uid() or is_club_staff(t.club_id))
  )
);

drop policy if exists "dev_plans_read" on development_plans;
create policy "dev_plans_read" on development_plans for select using (
  exists (
    select 1 from players pl
    join teams t on t.id = pl.team_id
    where pl.id = development_plans.player_id
      and (
        is_club_staff(t.club_id)
        or (pl.parent_id = auth.uid() and development_plans.status = 'published')
      )
  )
);

drop policy if exists "homework_read" on homework_items;
create policy "homework_read" on homework_items for select using (
  exists (
    select 1 from players pl
    join teams t on t.id = pl.team_id
    join development_plans dp on dp.id = homework_items.development_plan_id
    where pl.id = homework_items.player_id
      and (
        is_club_staff(t.club_id)
        or (pl.parent_id = auth.uid() and dp.status = 'published')
      )
  )
);

-- Parents only need club-wide items plus items for teams containing their children.
drop policy if exists "events_read" on events;
create policy "events_read" on events for select using (
  is_club_staff(club_id)
  or (
    club_id = current_user_club()
    and (
      team_id is null
      or exists (select 1 from players pl where pl.team_id = events.team_id and pl.parent_id = auth.uid())
    )
  )
);

drop policy if exists "announcements_read" on announcements;
create policy "announcements_read" on announcements for select using (
  is_club_staff(club_id)
  or (
    club_id = current_user_club()
    and (
      team_id is null
      or exists (select 1 from players pl where pl.team_id = announcements.team_id and pl.parent_id = auth.uid())
    )
  )
);

-- =========================================================
-- Director/staff operational CRUD
-- =========================================================
create policy "teams_update_director" on teams for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = teams.club_id and p.role = 'director')
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = teams.club_id and p.role = 'director')
);
create policy "teams_delete_director" on teams for delete using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = teams.club_id and p.role = 'director')
);

create policy "players_insert_staff" on players for insert with check (
  exists (select 1 from teams t where t.id = players.team_id and is_club_staff(t.club_id))
);
create policy "players_update_staff" on players for update using (
  exists (select 1 from teams t where t.id = players.team_id and is_club_staff(t.club_id))
) with check (
  exists (select 1 from teams t where t.id = players.team_id and is_club_staff(t.club_id))
);
create policy "players_delete_director" on players for delete using (
  exists (
    select 1 from teams t join profiles p on p.id = auth.uid()
    where t.id = players.team_id and p.club_id = t.club_id and p.role = 'director'
  )
);

create policy "team_coaches_read" on team_coaches for select using (
  exists (select 1 from teams t where t.id = team_coaches.team_id and is_club_member(t.club_id))
);

-- RSVP access.
create policy "event_rsvps_read" on event_rsvps for select using (
  exists (
    select 1 from events e
    join players pl on pl.id = event_rsvps.player_id
    where e.id = event_rsvps.event_id
      and (is_club_staff(e.club_id) or pl.parent_id = auth.uid())
  )
);
create policy "event_rsvps_insert" on event_rsvps for insert with check (
  exists (
    select 1 from events e
    join players pl on pl.id = event_rsvps.player_id
    where e.id = event_rsvps.event_id
      and (is_club_staff(e.club_id) or pl.parent_id = auth.uid())
  )
);
create policy "event_rsvps_update" on event_rsvps for update using (
  exists (
    select 1 from events e
    join players pl on pl.id = event_rsvps.player_id
    where e.id = event_rsvps.event_id
      and (is_club_staff(e.club_id) or pl.parent_id = auth.uid())
  )
) with check (
  exists (
    select 1 from events e
    join players pl on pl.id = event_rsvps.player_id
    where e.id = event_rsvps.event_id
      and (is_club_staff(e.club_id) or pl.parent_id = auth.uid())
  )
);

-- Attendance access.
create policy "attendance_read" on attendance_records for select using (
  exists (
    select 1 from events e
    join players pl on pl.id = attendance_records.player_id
    where e.id = attendance_records.event_id
      and (is_club_staff(e.club_id) or pl.parent_id = auth.uid())
  )
);
create policy "attendance_insert_staff" on attendance_records for insert with check (
  marked_by = auth.uid()
  and exists (select 1 from events e where e.id = attendance_records.event_id and is_club_staff(e.club_id))
);
create policy "attendance_update_staff" on attendance_records for update using (
  exists (select 1 from events e where e.id = attendance_records.event_id and is_club_staff(e.club_id))
) with check (
  marked_by = auth.uid()
  and exists (select 1 from events e where e.id = attendance_records.event_id and is_club_staff(e.club_id))
);

-- Parent-link records are visible only to directors for their own club. Parents claim
-- a code only through the SECURITY DEFINER RPC below, so raw codes aren't enumerable.
create policy "parent_link_codes_director_read" on parent_link_codes for select using (
  exists (
    select 1 from players pl
    join teams t on t.id = pl.team_id
    join profiles p on p.id = auth.uid()
    where pl.id = parent_link_codes.player_id and p.club_id = t.club_id and p.role = 'director'
  )
);

-- =========================================================
-- Secure helper RPCs for management workflows
-- =========================================================
create or replace function set_team_coach(p_team_id uuid, p_coach_id uuid, p_assigned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_club uuid;
  target_club uuid;
  target_role text;
begin
  select club_id into caller_club from profiles where id = auth.uid() and role = 'director';
  if caller_club is null then raise exception 'Only directors can assign coaches.'; end if;

  select club_id into target_club from teams where id = p_team_id;
  select role into target_role from profiles where id = p_coach_id and club_id = caller_club;
  if target_club is distinct from caller_club then raise exception 'Team is not in your club.'; end if;
  if target_role is distinct from 'coach' and target_role is distinct from 'director' then
    raise exception 'Selected member is not a coach.';
  end if;

  if p_assigned then
    insert into team_coaches (team_id, coach_id) values (p_team_id, p_coach_id) on conflict do nothing;
  else
    delete from team_coaches where team_id = p_team_id and coach_id = p_coach_id;
  end if;
end;
$$;

grant execute on function set_team_coach(uuid, uuid, boolean) to authenticated;

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
  select t.club_id into player_club from players pl join teams t on t.id = pl.team_id where pl.id = p_player_id;
  if caller_club is null or player_club is distinct from caller_club then
    raise exception 'Only this club''s director can create a parent link code.';
  end if;

  new_code := upper(substr(md5(random()::text || clock_timestamp()::text || p_player_id::text), 1, 8));
  delete from parent_link_codes where player_id = p_player_id and claimed_at is null;
  insert into parent_link_codes (player_id, code, created_by) values (p_player_id, new_code, auth.uid());
  return new_code;
end;
$$;

grant execute on function create_parent_link_code(uuid) to authenticated;

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

  select t.club_id into player_club from players pl join teams t on t.id = pl.team_id where pl.id = link.player_id;
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

grant execute on function claim_parent_link_code(text, boolean) to authenticated;

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
  select t.club_id, e.coach_id into plan_club, plan_coach
  from development_plans dp
  join players pl on pl.id = dp.player_id
  join teams t on t.id = pl.team_id
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

grant execute on function review_development_plan(uuid, boolean) to authenticated;

-- =========================================================
-- Team-scoped coach event creation. Directors may create club-wide or team
-- events; coaches may create/update events only for assigned teams.
-- =========================================================
drop policy if exists "events_write" on events;
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

drop policy if exists "events_update" on events;
create policy "events_update" on events for update using (
  club_id = current_user_club()
  and (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director')
    or exists (select 1 from team_coaches tc where tc.team_id = events.team_id and tc.coach_id = auth.uid())
  )
) with check (
  club_id = current_user_club()
  and (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director')
    or exists (select 1 from team_coaches tc where tc.team_id = events.team_id and tc.coach_id = auth.uid())
  )
);

-- =========================================================
-- Terms acceptance is recorded from an explicit signup checkbox, not inferred
-- later merely because a user signs in. The auth trigger writes the consent row
-- at account creation, which also works when email confirmation delays a session.
-- =========================================================
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  accepted_terms boolean;
  terms_version text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'parent');
  if requested_role not in ('coach', 'parent') then requested_role := 'parent'; end if;

  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'ClubHQ Member'),
    requested_role
  )
  on conflict (id) do nothing;

  accepted_terms := coalesce((new.raw_user_meta_data ->> 'terms_accepted')::boolean, false);
  terms_version := coalesce(nullif(new.raw_user_meta_data ->> 'terms_version', ''), 'v2');
  if accepted_terms then
    insert into consent_records (user_id, consent_type, policy_version)
    values (new.id, 'terms_and_privacy', terms_version);
  end if;

  return new;
end;
$$;

-- Club structure is director-owned. Coaches can evaluate and operate assigned
-- teams, but cannot create teams or rewrite roster identity data through the API.
drop policy if exists "teams_write_staff" on teams;
create policy "teams_write_staff" on teams for insert with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = teams.club_id and p.role = 'director')
);

drop policy if exists "players_insert_staff" on players;
create policy "players_insert_staff" on players for insert with check (
  exists (
    select 1 from teams t join profiles p on p.id = auth.uid()
    where t.id = players.team_id and p.club_id = t.club_id and p.role = 'director'
  )
);

drop policy if exists "players_update_staff" on players;
create policy "players_update_staff" on players for update using (
  exists (
    select 1 from teams t join profiles p on p.id = auth.uid()
    where t.id = players.team_id and p.club_id = t.club_id and p.role = 'director'
  )
) with check (
  exists (
    select 1 from teams t join profiles p on p.id = auth.uid()
    where t.id = players.team_id and p.club_id = t.club_id and p.role = 'director'
  )
);

-- Announcement audiences mirror event audiences: directors can communicate
-- club-wide; coaches can post only to teams they are assigned to.
drop policy if exists "announcements_write" on announcements;
create policy "announcements_write" on announcements for insert with check (
  author_id = auth.uid()
  and club_id = current_user_club()
  and (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director')
    or (
      team_id is not null
      and exists (select 1 from team_coaches tc where tc.team_id = announcements.team_id and tc.coach_id = auth.uid())
    )
  )
);
