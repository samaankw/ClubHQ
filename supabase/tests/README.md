# RLS policy tests

`rls.test.sql` is a [pgTAP](https://pgtap.org/) suite that exercises ClubHQ's
Row Level Security policies as real users, not as a role that bypasses RLS.
It never modifies existing data: every fixture it needs (clubs, teams,
players, evaluations, etc.) is created inside one transaction and the whole
thing is rolled back at the end, whichever way you run it.

All fixture IDs use the recognizable prefix `facecafe-...` (see the legend at
the top of `rls.test.sql`), so verifying nothing leaked after a run is one
query per table, e.g.:

```sql
select count(*) from teams where id::text like 'facecafe-%'; -- expect 0
```

## Why pgTAP isn't in `supabase/migrations/`

`pgtap` is a test-only dependency. Adding it to `supabase/migrations/` would
install it into every environment those migrations run against, including
production. Instead:

- On the **dev** Supabase project (`whrbxptrndmdnlojvhrk`) it's enabled ad hoc
  (`create extension pgtap;` run once, out of band, by hand or by whoever set
  up the project). It is already there — you don't need to (re-)enable it to
  run this suite against dev.
- Locally, `supabase test db` provisions pgTAP itself inside the ephemeral
  test database it spins up — see below.

## Option A: `supabase test db` (once Docker is available)

This is the standard, non-improvised way to run pgTAP tests against a
Supabase project, and is what CI should eventually use. It requires Docker,
which was not available in this environment when this suite was written —
hence Option B below as today's alternative.

```sh
# from the repo root
supabase test db
```

This starts a local Postgres via Docker, applies every migration in
`supabase/migrations/`, enables `pgtap` automatically, runs every `*.sql`
file under `supabase/tests/`, and prints TAP output. No further setup
required — it discovers this file automatically because of its location.

## Option B: via the Supabase MCP `execute_sql` tool (today, no Docker)

This is how the suite was actually developed and last verified, against the
**dev** project (`whrbxptrndmdnlojvhrk`) — never production.

pgTAP's `plan()`/`is()`/`throws_ok()`/`lives_ok()`/`finish()` functions each
return their TAP output as the return value of a `select`. Executed as
separate statements, most SQL clients (including the `execute_sql` MCP tool)
only surface the *last* statement's result set, so you won't see the
individual `ok 1 - ...` / `not ok 2 - ...` lines unless you collect them.
The fix used throughout development: accumulate every result into a
temporary table, then `select` it all out as the final statement.

1. Open `rls.test.sql` and copy its contents.
2. Wrap it as follows (this scaffolding is not in the file itself, since
   `supabase test db` does this collection for you natively):

```sql
begin;

create temporary table _tap_results (ord int primary key, line text);
grant insert, select on _tap_results to authenticated; -- needed once you set local role authenticated below

insert into _tap_results values (0, (select plan(24)));

-- ... paste every fixture INSERT/UPDATE from rls.test.sql, unchanged ...

-- Then paste every assertion, but wrap each one:
--   select is(x, y, 'description');
-- becomes:
--   insert into _tap_results values (<n>, (select is(x, y, 'description')));
-- with <n> incrementing 1, 2, 3, ... in the order they appear (and matching
-- the `set local request.jwt.claims` calls exactly as they appear in the file --
-- do not reorder them, several sections depend on switching identity).

insert into _tap_results values (999, (select * from finish()));

select line from _tap_results order by ord;

rollback;
```

3. Run that whole block in one `execute_sql` call against project
   `whrbxptrndmdnlojvhrk`. The result rows are the TAP output: `1..24`, then
   24 `ok N - ...` / `not ok N - ...` lines, then a `finish()` summary line.
4. **Verify cleanliness.** After the transaction rolls back nothing should
   remain. Confirm with (also against the dev project):

   ```sql
   select
     (select count(*) from auth.users where id::text like 'facecafe-%') as auth_users,
     (select count(*) from profiles   where id::text like 'facecafe-%') as profiles,
     (select count(*) from clubs      where id::text like 'facecafe-%') as clubs,
     (select count(*) from teams      where id::text like 'facecafe-%') as teams,
     (select count(*) from players    where id::text like 'facecafe-%') as players;
   -- every column must be 0
   ```

### Why `grant insert, select on _tap_results to authenticated` is needed

The fixtures are seeded while still the connection's own (superuser) role, so
RLS doesn't apply yet. The moment the script does `set local role
authenticated`, that role also needs privileges on the *scratch* results
table you created — it wasn't granted any by default. This grant is part of
the Option B scaffolding only; it has nothing to do with the app schema and
is never touched by `supabase test db`.

### A gotcha worth knowing before you edit this suite

pgTAP overloads `throws_ok()` by argument count/type. Calling it with three
plain string arguments —
`throws_ok(sql, '42501', 'my description')` — resolves to the
`(text, text, text)` overload, i.e. `(sql, expected_error_MESSAGE,
description)`, **not** `(sql, expected_sqlstate, description)`. That
silently turns every negative test into a check of the exact Postgres error
message rather than its SQLSTATE, and fails even when the RLS policy is
working correctly. Always pass the explicit 4-argument form used throughout
this file:

```sql
select throws_ok(
  $$...sql that should be rejected...$$,
  '42501',   -- SQLSTATE for insufficient_privilege (both RLS violations and
             -- revoked-grant errors use this code)
  null,      -- skip matching the exact error message
  'description of what this proves'
);
```

## What the suite asserts (24 assertions)

1. **Cross-club isolation** (10 assertions) — a director of club A sees only
   club A's teams, events, announcements, players, and profiles; none of
   club B's.
2. **Parent isolation** (2 assertions) — a parent sees only their own linked
   child, not their child's teammates (migration `0010` hardening).
3. **Draft plans hidden from parents** (3 assertions) — a parent sees only
   the `published` development plan for their child, not `draft` or
   `coach_reviewed` ones; staff see all statuses.
4. **`rate_limit_hits` is unreachable** (2 assertions) — an authenticated
   user gets a permission error on both `select` and `delete` (migration
   `0033` fix; a regression here re-opens uncapped AI spend).
5. **No self-promotion / no rogue team creation** (3 assertions) — a coach
   cannot change their own `role`, cannot insert a `teams` row
   (`teams_write_staff` is director-only), but *can* still update their own
   `full_name` (a positive control proving the block above is targeted, not
   a blanket denial).
6. **Messaging authorisation** (2 assertions) — a club member who is not a
   participant of a conversation cannot post into it (migration `0007`
   fix); an actual participant can.
7. **Evaluation authorisation** (2 assertions) — a coach cannot write an
   evaluation for a player outside their club; they can for one inside it.

Every negative case (`throws_ok`) is paired, where practical, with a positive
control (`lives_ok`) proving the corresponding action *does* work for a
legitimately authorized user — so a passing suite means the policy is
correctly scoped, not that it blocks everything indiscriminately.

## Last verified run (dev project, `whrbxptrndmdnlojvhrk`)

24 of 24 assertions passed. Zero leftover rows confirmed in every fixture
table afterwards. A deliberately inverted assertion (run as a separate,
rolled-back scratch probe — the checked-in file was never altered) was
confirmed to fail with `not ok`, alongside its correct sibling passing,
proving this suite can actually catch a regression rather than passing
unconditionally.
