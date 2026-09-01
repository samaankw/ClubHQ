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
