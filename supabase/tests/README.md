# Database tests

Applies every migration to a throwaway Postgres and asserts the behavior of
things that can't be checked by reading the SQL — currently the automatic
notice triggers from `0034_auto_change_announcements.sql` and
`0035_event_cancellation_notices.sql`.

These run against a real Postgres, not a mock. A trigger that fires at the
wrong point in a transaction, targets the wrong families, or trips a check
constraint will not show up in `npm run typecheck`, and it fails silently in
production: no error, just a parent who never hears that practice moved.

## Running

```bash
# One-time: a self-contained Postgres binary, no root and no system install
npm install --no-save @embedded-postgres/linux-x64
pip install psycopg2-binary

PGBIN=node_modules/@embedded-postgres/linux-x64/native/bin
rm -rf /tmp/clubhq-pgdata
$PGBIN/initdb -D /tmp/clubhq-pgdata -U postgres -A trust -E UTF8
$PGBIN/pg_ctl -D /tmp/clubhq-pgdata -o "-p 5439 -k /tmp" -l /tmp/clubhq-pg.log start

python3 supabase/tests/run_migrations.py     # applies 0001 → latest
python3 supabase/tests/test_change_notices.py
python3 supabase/tests/test_cancellation_notices.py
python3 supabase/tests/test_function_grants.py
python3 supabase/tests/test_public_rls.py

$PGBIN/pg_ctl -D /tmp/clubhq-pgdata stop -m fast
```

On macOS swap `linux-x64` for `darwin-arm64` (or `darwin-x64` on Intel).

## The other half

These tests stop at the database. They assert which audience a notice is
addressed to (`target_type`, `team_id`, rows in `announcement_player_targets`)
and that `author_id` is the caller, but not who that audience resolves to or
which devices get pinged — that is `send-announcement-push`, covered in
`supabase/functions/tests/` via `npm run test:functions`.

## What's stubbed

`run_migrations.py` creates a minimal stand-in for the pieces Supabase
provides: the `auth`, `extensions`, and `storage` schemas, an `auth.users`
table, the `authenticated` / `anon` / `service_role` roles, an `auth.uid()`
that reads a `test.uid` GUC so tests can act as different users, and the
default privileges a hosted project applies to new functions.

That last one is not cosmetic. Supabase ships with

```sql
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
```

so every function a migration creates is granted to `anon` in its own right,
on top of the PUBLIC grant Postgres adds by itself. A bare cluster has only
the PUBLIC grant. That difference is why `0036` — which revoked EXECUTE
`from public` and nothing else — passed here and changed nothing on the real
project, where `anon` could still call `delete_event` afterwards. `0037`
revokes `anon` by name and the harness now grants what production grants, so
the next migration that gets this wrong fails locally instead of in prod.

Known gap: `0029_club_media_per_club_scope.sql` fails locally because the stub
has no `storage.foldername()`. It's a storage-path policy and nothing under
test depends on it. Every other migration applies clean.

## Coverage

### `test_public_rls.py` (29 assertions)

Asserts every `public` table has RLS enabled, and that any table with zero
policies is both explicitly allow-listed (`ZERO_POLICY_ALLOWLIST`) and carries
a real `comment on table` explaining why. Catches a table shipped without RLS
the same way `rate_limit_hits` was in `0005` before `0038` fixed it.

### `test_function_grants.py` (27 assertions)

The only test here that checks permissions rather than behavior. Asserts that
the functions from `0034`/`0035` pin `search_path`, that `anon` cannot execute
any of them, and that `authenticated` still can — the last one matters because
an over-broad revoke breaks the app just as thoroughly as a missing one, and
fails in exactly the same silent way.

The anon check is made twice on purpose: once through
`has_function_privilege`, and once by actually calling `delete_event` under
`set local role anon` and asserting the error is Postgres's `permission denied
for function delete_event` rather than the function's own "not yours to
delete" exception. Those two failures look identical from the client and only
one of them means the grant is right.

The assertion the whole migration rests on:

> the deleting role genuinely lacks EXECUTE on the trigger function

`0036` revokes EXECUTE on `announce_event_cancellation()` from every role.
That is only safe because Postgres checks EXECUTE when `CREATE TRIGGER` runs,
not on each fire. If that were wrong, every cancellation notice in production
would stop, with no error anywhere. So the test deletes a real event as a role
that provably lacks EXECUTE and asserts the notice still appears.

There is also a catch-all asserting no unpinned functions remain in `public`.
It excludes `uuid_generate_v4()`, which is this harness's own uuid-ossp shim
(`run_migrations.py`) and lives in the `extensions` schema on Supabase.

### `test_cancellation_notices.py` (44 assertions)

Single and series cancellation; the title/body rendering including the
eight-session cap; targeting for team, player-targeted, and club-wide
sessions; past sessions and the coach's opt-out producing nothing; the RPCs
returning the notice ids the client pushes with; a stale "New time" notice
being retracted when the session it describes is cancelled; and two guards
that exist to stop the trigger firing where it shouldn't:

> deleting a team still works (cascade guard)

Deleting a club or a team cascades into `events`. Without the
`pg_trigger_depth() > 1` check, tearing down a team would emit a cancellation
per session *and* fail outright, because the notice's `team_id` points at the
team being removed.

> a deletion with no signed-in user writes nothing

Service-role deletions (backfills, `delete-account`) are far more likely to be
data repair than a real cancellation, and "your sessions are cancelled" is not
a message to send on a guess.

### `test_change_notices.py` (35 assertions)

Covers time-only, location-only, and
combined changes; category and title selection; past sessions and notes-only
edits producing nothing; the coach's opt-out; two edits folding into one notice
measured from the original values; a revert retracting the notice; team,
player-targeted, and club-wide targeting; and notices surviving event deletion.

The assertion worth keeping if you ever trim this file:

> notice goes to the NEW player, not the old one (deferred trigger)

`update_targeted_event` updates the event row and *then* rewrites
`event_players`. A plain `after update` trigger reads the old targeting and
sends the notice to the family that just got taken off the session. That's why
the trigger is a `constraint trigger ... deferrable initially deferred`, and
this is the test that fails if someone ever "simplifies" it back.

## Why the two triggers fire at opposite ends

Both need to read `event_players` to work out who to notify, and the window
where that table holds the right rows is different in each direction:

| | when `event_players` is right | so the trigger is |
|---|---|---|
| update | after `update_targeted_event` rewrites it | `AFTER`, deferred to commit |
| delete | before the FK cascade clears it | `BEFORE` |

On update the child rows land too late; on delete they vanish too early.
Moving either trigger to the other side silently misaddresses notices rather
than raising an error, which is why both cases have a named test.

## RLS policy tests (`rls.test.sql`, pgTAP)

`rls.test.sql` is a [pgTAP](https://pgtap.org/) suite that exercises RLS
policies as real users, not as a role that bypasses RLS -- a different
angle than the Python suites above, which test trigger *behavior* rather than
*who's allowed to see or change what*. It never modifies existing data: every
fixture (clubs, teams, players, evaluations, etc.) is created inside one
transaction and rolled back at the end, whichever way you run it. All fixture
IDs use the prefix `facecafe-...` (see the legend at the top of the file), so
confirming nothing leaked after a run is one `count(*) ... like 'facecafe-%'`
query per table.

**Verification status, read before trusting this file:** of the 29 assertions
in `plan(29)`, only the first 24 have actually been run end-to-end (against a
separate development Supabase project, not this app's) and confirmed passing,
with a deliberately-inverted scratch probe confirming the suite can catch a
real regression rather than passing unconditionally. The remaining 5 -- the
`anon` pair under `rate_limit_hits`, the three `parent_link_codes` assertions,
and the conversion of one positive control from `lives_ok` to an explicit
`is()` -- were added and reviewed with no database available and have **not**
been executed. Run the full file for real, against this project's own schema,
before relying on it -- don't assume it's clean just because it's checked in.

### Why pgTAP isn't in `supabase/migrations/`

`pgtap` is a test-only dependency. Adding it there would install it into
every environment those migrations run against, including production.
Instead: enable it once, out of band (`create extension pgtap;`) on whichever
project you're testing against, or let `supabase test db` provision it
automatically inside its own ephemeral database (see below) -- never inside a
real migration.

### Option A: `supabase test db` (needs Docker)

The standard way to run this, and what CI should eventually use:

```sh
supabase test db
```

Starts a local Postgres via Docker, applies every migration, enables `pgtap`
automatically, runs every `*.sql` file under `supabase/tests/`, and prints TAP
output -- no further setup, it finds this file by location alone.

### Option B: via a SQL client with no Docker available

pgTAP's `plan()`/`is()`/`throws_ok()`/`lives_ok()`/`finish()` each return
their TAP output as a `select` result. Most clients only surface the *last*
statement's result set when a script runs as separate statements, so collect
every line into a temp table and select it all out at the end:

```sql
begin;

create temporary table _tap_results (ord int primary key, line text);
grant insert, select on _tap_results to authenticated; -- needed once you set local role authenticated below

insert into _tap_results values (0, (select plan(29)));

-- ... paste every fixture INSERT/UPDATE from rls.test.sql, unchanged ...

-- Each assertion `select is(x, y, 'description');` becomes:
--   insert into _tap_results values (<n>, (select is(x, y, 'description')));
-- with <n> incrementing in the order assertions appear in the file (and
-- matching every `set local request.jwt.claims` call exactly as it appears --
-- several sections depend on switching identity in that exact order).

insert into _tap_results values (999, (select * from finish()));

select line from _tap_results order by ord;

rollback;
```

Run the whole block in one transaction, then verify cleanliness with a
`count(*) ... like 'facecafe-%'` query per fixture table (every column should
be 0).

The `grant insert, select on _tap_results to authenticated` line is part of
this manual scaffolding only -- fixtures are seeded under the connection's own
role before RLS applies, but the moment the script does `set local role
authenticated`, that role needs privileges on the *scratch* table too. It has
nothing to do with the app schema and `supabase test db` doesn't need it.

### A gotcha worth knowing before editing this suite

pgTAP overloads `throws_ok()` by argument count/type. Calling it with three
plain string arguments -- `throws_ok(sql, '42501', 'description')` -- resolves
to the `(text, text, text)` overload, i.e. `(sql, expected_error_MESSAGE,
description)`, **not** `(sql, expected_sqlstate, description)`. That silently
turns a negative test into a check of the exact Postgres error message rather
than its SQLSTATE, and fails even when the RLS policy is working correctly.
Always use the explicit 4-argument form used throughout this file:

```sql
select throws_ok(
  $$...sql that should be rejected...$$,
  '42501',   -- SQLSTATE for insufficient_privilege
  null,      -- skip matching the exact error message
  'description of what this proves'
);
```

### What the suite asserts

1. **Cross-club isolation** (10 assertions) -- a director of club A sees only
   club A's teams, events, announcements, players, and profiles; none of
   club B's.
2. **Parent isolation** (2 assertions) -- a parent sees only their own linked
   child, not their child's teammates.
3. **Draft plans hidden from parents** (3 assertions) -- a parent sees only
   the `published` development plan for their child, not `draft` or
   `coach_reviewed` ones; staff see all statuses.
4. **`rate_limit_hits` is unreachable** (2 assertions, unverified -- see
   above) -- an authenticated user gets a permission error on both `select`
   and `delete`.
5. **No self-promotion / no rogue team creation** (3 assertions) -- a coach
   cannot change their own `role` or insert a `teams` row, but *can* still
   update their own `full_name` (a positive control proving the block is
   targeted, not a blanket denial).
6. **Messaging authorization** (2 assertions) -- a club member who isn't a
   conversation participant can't post into it; an actual participant can.
7. **Evaluation authorization** (2 assertions) -- a coach can't write an
   evaluation for a player outside their club; they can for one inside it.

Every negative case (`throws_ok`) is paired, where practical, with a positive
control (`lives_ok`) proving the corresponding action *does* work for a
legitimately authorized user -- a passing suite means the policy is correctly
scoped, not that it blocks everything indiscriminately.

### What this suite does NOT cover

26 tables in `public` have RLS enabled. This suite asserts against 10 of them
(`teams`, `events`, `announcements`, `players`, `profiles`,
`development_plans`, `rate_limit_hits`, `parent_link_codes`, `messages`,
`evaluations`). The remaining 16 have no assertion at all: `clubs`,
`player_payments`, `push_tokens`, `consent_records`, `role_change_log`,
`attendance_records`, `event_rsvps`, `event_players`,
`announcement_player_targets`, `announcement_reads`, `homework_items`,
`drills`, `conversations`, `conversation_participants`, `team_coaches`,
`report_views`.

Worth doing next, by blast radius: `player_payments` (financial; the parent
read path added in `0032` is untested), `consent_records` and
`role_change_log` (legal/audit records -- nothing asserts they aren't
client-writable), `push_tokens`, and `clubs` (the object every other policy
scopes against).

Nothing runs this suite automatically yet -- there's no CI wiring for it (it
can't run without a database, and this repo's CI doesn't have Docker/pgTAP
set up). Until that changes, it only proves anything on the day someone
actually runs it.
