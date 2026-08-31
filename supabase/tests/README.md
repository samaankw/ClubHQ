# Database tests

Applies every migration to a throwaway Postgres and asserts the behavior of
things that can't be checked by reading the SQL — currently the auto
change-notice trigger from `0033_auto_change_announcements.sql`.

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

$PGBIN/pg_ctl -D /tmp/clubhq-pgdata stop -m fast
```

On macOS swap `linux-x64` for `darwin-arm64` (or `darwin-x64` on Intel).

## What's stubbed

`run_migrations.py` creates a minimal stand-in for the pieces Supabase
provides: the `auth`, `extensions`, and `storage` schemas, an `auth.users`
table, the `authenticated` / `anon` / `service_role` roles, and an `auth.uid()`
that reads a `test.uid` GUC so tests can act as different users.

Known gap: `0029_club_media_per_club_scope.sql` fails locally because the stub
has no `storage.foldername()`. It's a storage-path policy and nothing under
test depends on it. Every other migration applies clean.

## Coverage

`test_change_notices.py` (34 assertions) covers time-only, location-only, and
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
