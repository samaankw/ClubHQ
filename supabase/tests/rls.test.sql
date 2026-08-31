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

select plan(24);

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
  $$delete from rate_limit_hits$$,
  '42501',
  null,
  'authenticated user cannot delete from rate_limit_hits (cannot reset their own AI rate limit)'
);

-- ==================== 5. Role self-promotion blocked; coach cannot create a team ====================
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
select lives_ok(
  $$update profiles set full_name = 'RLS Coach A Renamed' where id = 'facecafe-0001-0000-0000-000000000002'$$,
  'positive control: coach_a CAN update their own full_name (proves the block above is role/column-specific, not a blanket denial)'
);

-- ==================== 6. Messaging authorisation -- cannot post into a conversation you are not in (0007 fix) ====================
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

-- ==================== 7. Evaluation authorisation -- coach cannot evaluate a player outside their club ====================
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
