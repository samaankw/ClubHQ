-- =========================================================
-- Security hardening pass
-- Fixes:
--   1. Users could set their OWN role/club_id (e.g. sign up claiming to be a
--      "director" of an existing club) because profiles.role and
--      profiles.club_id were writable by the owning user like any other field.
--   2. Coaches/parents could technically insert announcements/events (the UI
--      hid the button, but the database didn't enforce staff-only writes).
--   3. A coach's evaluation-write policy only checked coach_id = auth.uid(),
--      not that the coach actually belongs to the same club as the player.
--   4. The shared (club_id IS NULL) drill library was writable by any club
--      member, not just the intended admin/migration seeding.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Lock down which profile columns a user can self-edit.
--    role and club_id can now ONLY change via the SECURITY DEFINER
--    functions below, which run with elevated privileges and enforce
--    their own rules (rather than trusting whatever the client sends).
-- ---------------------------------------------------------
revoke update on profiles from authenticated;
grant update (full_name, avatar_url) on profiles to authenticated;

-- Insert policy: a new signup can only insert their OWN row, and must
-- start as coach or parent with no club — never "director", never
-- pre-attached to a club they haven't been vetted into.
drop policy if exists "profiles_insert_self" on profiles;
create policy "profiles_insert_self" on profiles for insert with check (
  id = auth.uid()
  and role in ('coach', 'parent')
  and club_id is null
);

-- ---------------------------------------------------------
-- 2. Club creation / joining, done server-side so the rules are
--    actually enforced instead of trusted from the client.
-- ---------------------------------------------------------
alter table clubs add column if not exists join_code text unique default substr(md5(random()::text || clock_timestamp()::text), 1, 6);

-- Creates a new club and makes the calling user its director.
-- This is the ONLY way a user becomes a director — there's no signup
-- checkbox for it anymore.
create or replace function create_club(club_name text)
returns clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  new_club clubs;
  caller_club uuid;
begin
  select club_id into caller_club from profiles where id = auth.uid();
  if caller_club is not null then
    raise exception 'You already belong to a club.';
  end if;

  insert into clubs (name, owner_id) values (club_name, auth.uid())
  returning * into new_club;

  update profiles set role = 'director', club_id = new_club.id where id = auth.uid();

  return new_club;
end;
$$;

-- Joins an existing club via its join code. Keeps whatever role the user
-- signed up with (coach or parent) — joining a club never grants director.
create or replace function join_club(code text)
returns clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club clubs;
  caller_club uuid;
begin
  select club_id into caller_club from profiles where id = auth.uid();
  if caller_club is not null then
    raise exception 'You already belong to a club.';
  end if;

  select * into target_club from clubs where join_code = code;
  if target_club.id is null then
    raise exception 'Invalid invite code.';
  end if;

  update profiles set club_id = target_club.id where id = auth.uid();

  return target_club;
end;
$$;

-- Lets an existing director promote/demote a member's role within their
-- own club (e.g. parent -> coach). Cannot be used to grant "director" to
-- someone outside a director's own club, and cannot touch club_id.
create or replace function set_member_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_club uuid;
  target_club uuid;
begin
  select role, club_id into caller_role, caller_club from profiles where id = auth.uid();
  if caller_role is distinct from 'director' then
    raise exception 'Only directors can change member roles.';
  end if;
  if new_role not in ('coach', 'parent', 'director') then
    raise exception 'Invalid role.';
  end if;

  select club_id into target_club from profiles where id = target_user_id;
  if target_club is distinct from caller_club then
    raise exception 'That person is not in your club.';
  end if;

  update profiles set role = new_role where id = target_user_id;
end;
$$;

grant execute on function create_club(text) to authenticated;
grant execute on function join_club(text) to authenticated;
grant execute on function set_member_role(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- 3. Staff-only writes for announcements/events/drills.
--    is_club_member() only checked club membership, which let ANY
--    coach/director/parent write these via direct API calls even
--    though the app UI restricted the buttons to coaches/directors.
-- ---------------------------------------------------------
create or replace function is_club_staff(target_club uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.club_id = target_club and p.role in ('coach', 'director')
  );
$$;

drop policy if exists "announcements_write" on announcements;
create policy "announcements_write" on announcements for insert with check (is_club_staff(club_id) and author_id = auth.uid());

drop policy if exists "events_write" on events;
create policy "events_write" on events for insert with check (is_club_staff(club_id) and created_by = auth.uid());

drop policy if exists "teams_write_staff" on teams;
create policy "teams_write_staff" on teams for insert with check (is_club_staff(club_id));

-- ---------------------------------------------------------
-- 4. Evaluations: a coach could previously write an evaluation for ANY
--    player, as long as they set coach_id to themselves — nothing
--    checked they actually coach that player's club.
-- ---------------------------------------------------------
drop policy if exists "evaluations_write" on evaluations;
create policy "evaluations_write" on evaluations for insert with check (
  coach_id = auth.uid()
  and exists (
    select 1 from players pl join teams t on t.id = pl.team_id
    where pl.id = evaluations.player_id and is_club_staff(t.club_id)
  )
);

-- ---------------------------------------------------------
-- 5. Drills: only staff can add club-specific drills; the shared
--    (club_id IS NULL) starter library is seed-only, not client-writable.
-- ---------------------------------------------------------
drop policy if exists "drills_write" on drills;
create policy "drills_write" on drills for insert with check (
  club_id is not null and is_club_staff(club_id) and added_by = auth.uid()
);
