-- =========================================================
-- ClubHQ Row Level Security policy tests (Task 34)
--
-- Uses pgTAP (installed ad hoc on the dev project; see supabase/tests/README.md
-- for why it is not in supabase/migrations/). Everything here runs inside one
-- transaction that is always rolled back, so nothing persists and no existing
-- row is ever read, modified, or deleted.
--
-- Fixture IDs all use the recognizable prefix 'facecafe-' so a leftover-row
-- check after any run is a single grep-able query per table (see README).
--
-- Technique: seed fixtures as the (superuser) connection role -- which
-- bypasses RLS -- then `set local role authenticated` and impersonate a
-- specific user via `request.jwt.claims`, so every assertion below actually
-- runs through Postgres RLS as that user, not as a role that bypasses it.
-- =========================================================

begin;

select plan(29);

-- ---------------------------------------------------------
-- Fixture legend (all IDs prefixed facecafe- for easy cleanup verification)
--
--   club_a           facecafe-0000-0000-0000-00000000000a
--   club_b           facecafe-0000-0000-0000-00000000000b
--   director_a       facecafe-0001-0000-0000-000000000001  (club_a, director)
--   coach_a          facecafe-0001-0000-0000-000000000002  (club_a, coach, coaches team_a)
--   parent_a1        facecafe-0001-0000-0000-000000000003  (club_a, parent of player_a1)
--   parent_a2        facecafe-0001-0000-0000-000000000004  (club_a, parent of player_a2)
--   director_b       facecafe-0001-0000-0000-000000000005  (club_b, director)
--   team_a           facecafe-0002-0000-0000-000000000001  (club_a)
--   team_b           facecafe-0002-0000-0000-000000000002  (club_b)
--   player_a1        facecafe-0003-0000-0000-000000000001  (team_a, parent = parent_a1)
--   player_a2        facecafe-0003-0000-0000-000000000002  (team_a, parent = parent_a2)
--   player_b1        facecafe-0003-0000-0000-000000000003  (team_b, no parent)
--   ann_a            facecafe-0004-0000-0000-000000000001  (club_a, club-wide)
--   ann_b            facecafe-0004-0000-0000-000000000002  (club_b, club-wide)
--   event_a          facecafe-0005-0000-0000-000000000001  (club_a, club-wide)
--   event_b          facecafe-0005-0000-0000-000000000002  (club_b, club-wide)
--   eval_a1          facecafe-0006-0000-0000-000000000001  (player_a1, by coach_a)
--   plan_draft       facecafe-0007-0000-0000-000000000001  (player_a1, status=draft)
--   plan_reviewed    facecafe-0007-0000-0000-000000000002  (player_a1, status=coach_reviewed)
--   plan_published   facecafe-0007-0000-0000-000000000003  (player_a1, status=published)
--   conv_a           facecafe-0008-0000-0000-000000000001  (club_a/team_a, participant = parent_a1 only)
--   link_code_a1     facecafe-0009-0000-0000-000000000001  (player_a1, created by director_a)
-- ---------------------------------------------------------

-- ==================== Seed fixtures (runs as the connection's superuser role, bypasses RLS) ====================

-- auth.users insert fires the on_auth_user_created trigger, which creates the
-- matching `profiles` row for us (role defaults to 'parent', club_id null).
-- We correct role/club_id afterwards with UPDATE -- never INSERT into profiles
-- directly, since that would conflict with the trigger-created row.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('facecafe-0001-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-director-a@test.local', 'x', now(), now(), now()),
  ('facecafe-0001-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-coach-a@test.local', 'x', now(), now(), now()),
  ('facecafe-0001-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-parent-a1@test.local', 'x', now(), now(), now()),
  ('facecafe-0001-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-parent-a2@test.local', 'x', now(), now(), now()),
  ('facecafe-0001-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-director-b@test.local', 'x', now(), now(), now());

insert into clubs (id, name, owner_id) values
  ('facecafe-0000-0000-0000-00000000000a', 'RLS Test Club A', 'facecafe-0001-0000-0000-000000000001'),
  ('facecafe-0000-0000-0000-00000000000b', 'RLS Test Club B', 'facecafe-0001-0000-0000-000000000005');

update profiles set full_name = 'RLS Director A', role = 'director', club_id = 'facecafe-0000-0000-0000-00000000000a' where id = 'facecafe-0001-0000-0000-000000000001';
update profiles set full_name = 'RLS Coach A',    role = 'coach',    club_id = 'facecafe-0000-0000-0000-00000000000a' where id = 'facecafe-0001-0000-0000-000000000002';
update profiles set full_name = 'RLS Parent A1',  role = 'parent',   club_id = 'facecafe-0000-0000-0000-00000000000a' where id = 'facecafe-0001-0000-0000-000000000003';
update profiles set full_name = 'RLS Parent A2',  role = 'parent',   club_id = 'facecafe-0000-0000-0000-00000000000a' where id = 'facecafe-0001-0000-0000-000000000004';
update profiles set full_name = 'RLS Director B', role = 'director', club_id = 'facecafe-0000-0000-0000-00000000000b' where id = 'facecafe-0001-0000-0000-000000000005';

insert into teams (id, club_id, name) values
  ('facecafe-0002-0000-0000-000000000001', 'facecafe-0000-0000-0000-00000000000a', 'RLS Team A'),
  ('facecafe-0002-0000-0000-000000000002', 'facecafe-0000-0000-0000-00000000000b', 'RLS Team B');

insert into team_coaches (team_id, coach_id) values
  ('facecafe-0002-0000-0000-000000000001', 'facecafe-0001-0000-0000-000000000002');

insert into players (id, team_id, parent_id, full_name) values
  ('facecafe-0003-0000-0000-000000000001', 'facecafe-0002-0000-0000-000000000001', 'facecafe-0001-0000-0000-000000000003', 'RLS Player A1'),
  ('facecafe-0003-0000-0000-000000000002', 'facecafe-0002-0000-0000-000000000001', 'facecafe-0001-0000-0000-000000000004', 'RLS Player A2'),
  ('facecafe-0003-0000-0000-000000000003', 'facecafe-0002-0000-0000-000000000002', null, 'RLS Player B1');

insert into announcements (id, club_id, team_id, author_id, title, body) values
  ('facecafe-0004-0000-0000-000000000001', 'facecafe-0000-0000-0000-00000000000a', null, 'facecafe-0001-0000-0000-000000000001', 'RLS Ann A', 'club-wide A'),
  ('facecafe-0004-0000-0000-000000000002', 'facecafe-0000-0000-0000-00000000000b', null, 'facecafe-0001-0000-0000-000000000005', 'RLS Ann B', 'club-wide B');

insert into events (id, club_id, team_id, type, title, starts_at, created_by) values
  ('facecafe-0005-0000-0000-000000000001', 'facecafe-0000-0000-0000-00000000000a', null, 'club_event', 'RLS Event A', now() + interval '1 day', 'facecafe-0001-0000-0000-000000000001'),
  ('facecafe-0005-0000-0000-000000000002', 'facecafe-0000-0000-0000-00000000000b', null, 'club_event', 'RLS Event B', now() + interval '1 day', 'facecafe-0001-0000-0000-000000000005');

insert into evaluations (id, player_id, coach_id, first_touch) values
  ('facecafe-0006-0000-0000-000000000001', 'facecafe-0003-0000-0000-000000000001', 'facecafe-0001-0000-0000-000000000002', 5);

insert into development_plans (id, player_id, evaluation_id, priorities, status) values
  ('facecafe-0007-0000-0000-000000000001', 'facecafe-0003-0000-0000-000000000001', 'facecafe-0006-0000-0000-000000000001', '[]'::jsonb, 'draft'),
  ('facecafe-0007-0000-0000-000000000002', 'facecafe-0003-0000-0000-000000000001', 'facecafe-0006-0000-0000-000000000001', '[]'::jsonb, 'coach_reviewed'),
  ('facecafe-0007-0000-0000-000000000003', 'facecafe-0003-0000-0000-000000000001', 'facecafe-0006-0000-0000-000000000001', '[]'::jsonb, 'published');

insert into conversations (id, club_id, team_id, type) values
  ('facecafe-0008-0000-0000-000000000001', 'facecafe-0000-0000-0000-00000000000a', 'facecafe-0002-0000-0000-000000000001', 'team_group');

insert into conversation_participants (conversation_id, profile_id) values
  ('facecafe-0008-0000-0000-000000000001', 'facecafe-0001-0000-0000-000000000003'); -- parent_a1 only

insert into parent_link_codes (id, player_id, code, created_by) values
  ('facecafe-0009-0000-0000-000000000001', 'facecafe-0003-0000-0000-000000000001', 'RLSTESTCODE1', 'facecafe-0001-0000-0000-000000000001');

-- ==================== 1. Cross-club isolation (as director_a) ====================
set local role authenticated;
set local request.jwt.claims to '{"sub":"facecafe-0001-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from teams where club_id = 'facecafe-0000-0000-0000-00000000000a'),
  1, 'director_a sees own club''s team'
);
select is(
  (select count(*)::int from teams where club_id = 'facecafe-0000-0000-0000-00000000000b'),
  0, 'director_a sees none of club B''s teams'
);
select is(
  (select count(*)::int from events where club_id = 'facecafe-0000-0000-0000-00000000000a'),
  1, 'director_a sees own club''s events'
);
select is(
  (select count(*)::int from events where club_id = 'facecafe-0000-0000-0000-00000000000b'),
  0, 'director_a sees none of club B''s events'
);
select is(
  (select count(*)::int from announcements where club_id = 'facecafe-0000-0000-0000-00000000000a'),
  1, 'director_a sees own club''s announcements'
);
select is(
  (select count(*)::int from announcements where club_id = 'facecafe-0000-0000-0000-00000000000b'),
  0, 'director_a sees none of club B''s announcements'
);
select is(
  (select count(*)::int from players where team_id = 'facecafe-0002-0000-0000-000000000001'),
  2, 'director_a (staff) sees both of club A''s players'
);
select is(
  (select count(*)::int from players where team_id = 'facecafe-0002-0000-0000-000000000002'),
  0, 'director_a sees none of club B''s players'
);
select is(
  (select count(*)::int from profiles where club_id = 'facecafe-0000-0000-0000-00000000000a'),
  4, 'director_a sees all 4 profiles in own club'
);
select is(
  (select count(*)::int from profiles where club_id = 'facecafe-0000-0000-0000-00000000000b'),
  0, 'director_a sees none of club B''s profiles'
);

-- ==================== 2. Parent isolation (as parent_a1) ====================
set local request.jwt.claims to '{"sub":"facecafe-0001-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from players where team_id = 'facecafe-0002-0000-0000-000000000001'),
  1, 'parent_a1 sees only their own linked child, not the whole team/club'
);
select is(
  (select count(*)::int from players where id = 'facecafe-0003-0000-0000-000000000002'),
  0, 'parent_a1 cannot see player_a2 (a different family''s child)'
);

-- ==================== 3. Draft development plans hidden from parents; staff see all ====================
-- (still impersonating parent_a1)
select is(
  (select count(*)::int from development_plans where player_id = 'facecafe-0003-0000-0000-000000000001'),
  1, 'parent_a1 sees exactly one development plan for their child (the published one)'
);
select is(
  (select status from development_plans where player_id = 'facecafe-0003-0000-0000-000000000001'),
  'published', 'the one plan visible to parent_a1 has status=published, not draft/coach_reviewed'
);

set local request.jwt.claims to '{"sub":"facecafe-0001-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from development_plans where player_id = 'facecafe-0003-0000-0000-000000000001'),
  3, 'staff (director_a) sees all 3 plans regardless of status'
);

-- ==================== 4. rate_limit_hits unreachable by an authenticated user (0033 fix) ====================
-- (still impersonating director_a; identity is irrelevant here, the table is unreachable for ANY authenticated user)
select throws_ok(
  $$select * from rate_limit_hits$$,
  '42501',
  null,
  'authenticated user cannot select rate_limit_hits (0033 fix -- a regression here re-opens uncapped AI spend)'
);
select throws_ok(
  -- Scoped deliberately. An unqualified delete here proves the same permission
  -- denial, but the day the revoke regresses it stops throwing and becomes a
  -- full-table wipe of live rate-limit state -- against whatever database the
  -- suite was pointed at.
  $$delete from rate_limit_hits where user_id = 'facecafe-0001-0000-0000-000000000001'$$,
  '42501',
  null,
  'authenticated user cannot delete from rate_limit_hits (cannot reset their own AI rate limit)'
);

-- 0033 revokes from anon AND authenticated, and anon is the role the
-- publishable key maps to -- a key that ships inside the distributed app
-- bundle, making it the more exposed of the two. Asserting only the
-- authenticated side would let a `grant ... to anon` regression through with
-- all assertions green.
set local role anon;
-- No jwt claims: this is what an unauthenticated PostgREST request looks like.
select throws_ok(
  $$select * from rate_limit_hits$$,
  '42501',
  null,
  'anon cannot select rate_limit_hits (the publishable key ships in the app bundle)'
);
select throws_ok(
  $$delete from rate_limit_hits where user_id = 'facecafe-0001-0000-0000-000000000001'$$,
  '42501',
  null,
  'anon cannot delete from rate_limit_hits'
);
set local role authenticated;

-- ==================== 5. Parent link codes readable only by a director of the same club ====================
-- claim_parent_link_code turns one of these rows into a parent-child link, so
-- a read regression here is a stranger claiming someone else's child. Codes
-- are claimed through a SECURITY DEFINER RPC precisely so they are never
-- enumerable from the client.
set local request.jwt.claims to '{"sub":"facecafe-0001-0000-0000-000000000001","role":"authenticated"}'; -- director_a
select is(
  (select count(*)::int from parent_link_codes where player_id = 'facecafe-0003-0000-0000-000000000001'),
  1, 'director_a sees the link code for a player in their own club'
);

set local request.jwt.claims to '{"sub":"facecafe-0001-0000-0000-000000000005","role":"authenticated"}'; -- director_b
select is(
  (select count(*)::int from parent_link_codes where player_id = 'facecafe-0003-0000-0000-000000000001'),
  0, 'director_b cannot read another club''s link codes'
);

set local request.jwt.claims to '{"sub":"facecafe-0001-0000-0000-000000000003","role":"authenticated"}'; -- parent_a1
select is(
  (select count(*)::int from parent_link_codes),
  0, 'a parent cannot enumerate link codes, not even for their own child'
);

-- ==================== 6. Role self-promotion blocked; coach cannot create a team ====================
set local request.jwt.claims to '{"sub":"facecafe-0001-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$update profiles set role = 'director' where id = 'facecafe-0001-0000-0000-000000000002'$$,
  '42501',
  null,
  'coach_a cannot self-promote to director (role column is not grant-writable by authenticated)'
);
select throws_ok(
  $$insert into teams (club_id, name) values ('facecafe-0000-0000-0000-00000000000a', 'Illegal Team')$$,
  '42501',
  null,
  'coach_a cannot insert a team (teams_write_staff is director-only)'
);
-- Positive control. Deliberately NOT lives_ok: under RLS an UPDATE whose rows
-- are filtered out by a policy's USING clause affects zero rows without
-- raising, so lives_ok here would still pass if profiles_update_self were
-- dropped outright and the write silently touched nothing. Assert the effect.
update profiles set full_name = 'RLS Coach A Renamed' where id = 'facecafe-0001-0000-0000-000000000002';
select is(
  (select full_name from profiles where id = 'facecafe-0001-0000-0000-000000000002'),
  'RLS Coach A Renamed',
  'positive control: coach_a CAN update their own full_name (proves the block above is role/column-specific, not a blanket denial)'
);

-- ==================== 7. Messaging authorisation -- cannot post into a conversation you are not in (0007 fix) ====================
set local request.jwt.claims to '{"sub":"facecafe-0001-0000-0000-000000000004","role":"authenticated"}'; -- parent_a2: same club, NOT a participant of conv_a

select throws_ok(
  $$insert into messages (conversation_id, sender_id, body) values ('facecafe-0008-0000-0000-000000000001', 'facecafe-0001-0000-0000-000000000004', 'hi')$$,
  '42501',
  null,
  'parent_a2 (same club, not a participant) cannot post into conv_a'
);

set local request.jwt.claims to '{"sub":"facecafe-0001-0000-0000-000000000003","role":"authenticated"}'; -- parent_a1: IS a participant
select lives_ok(
  $$insert into messages (conversation_id, sender_id, body) values ('facecafe-0008-0000-0000-000000000001', 'facecafe-0001-0000-0000-000000000003', 'hi')$$,
  'positive control: parent_a1 (an actual participant) CAN post into conv_a'
);

-- ==================== 8. Evaluation authorisation -- coach cannot evaluate a player outside their club ====================
set local request.jwt.claims to '{"sub":"facecafe-0001-0000-0000-000000000002","role":"authenticated"}'; -- coach_a

select throws_ok(
  $$insert into evaluations (player_id, coach_id, first_touch) values ('facecafe-0003-0000-0000-000000000003', 'facecafe-0001-0000-0000-000000000002', 5)$$,
  '42501',
  null,
  'coach_a cannot write an evaluation for player_b1 (a different club''s player)'
);
select lives_ok(
  $$insert into evaluations (player_id, coach_id, first_touch) values ('facecafe-0003-0000-0000-000000000001', 'facecafe-0001-0000-0000-000000000002', 6)$$,
  'positive control: coach_a CAN evaluate player_a1 (their own club''s player)'
);

select * from finish();

rollback;
