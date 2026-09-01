# ClubHQ

React Native (Expo SDK ~57.0.17) + React 19.2.3 + TypeScript ~6.0.3 (strict)

- Expo Router (file-based routing) + Supabase/Postgres.

Working branch for the current hardening effort: `feat/unified-schedule-feed`.
`main` is a separate, actively-shipping line of work (an org-type/adaptive-shell
retrofit) and is intentionally not merged into this branch yet — don't merge
them as a side effect of unrelated work.

## Commands

```bash
npm install
npm run typecheck        # tsc --noEmit -- must be clean, no workaround needed
npm run lint             # eslint . -- 0 errors is the bar; warnings are tracked, not blocking
npm run format:check     # prettier --check .
npm run format           # prettier --write . (respects .prettierignore's incremental scope, see below)
npm test                 # jest
npm run test:functions   # deno test --quiet --no-check=remote supabase/functions/tests/
npm run gen:types        # supabase gen types typescript --linked > types/database.types.ts
```

Requires **Node >=22.13.0** (`package.json#engines`). If `node -v` is older,
`node scripts/project-check.mjs` and other tooling can fail for that reason —
that's an environment mismatch, not a product-code regression. Record the
actual Node version in any report; don't conflate the two failure modes.

Requires **Deno** on PATH for `test:functions` (`brew install deno`). Requires
**Python 3 + psycopg2** and an **embedded Postgres** package for the migration
suite below — a project-local venv (`python3 -m venv .venv && .venv/bin/pip
install psycopg2-binary`) avoids fighting Homebrew Python's PEP 668
protection; don't reach for `--break-system-packages` on the system Python.

## Migration suite

**Every run needs a freshly rebuilt Postgres data directory first** — the
migration set is not idempotent as a suite, and reusing a data directory
between runs produces false results in either direction.

```bash
npm install --no-save @embedded-postgres/darwin-arm64   # or darwin-x64 / linux-x64
PGBIN=node_modules/@embedded-postgres/darwin-arm64/native/bin
rm -rf /tmp/clubhq-pgdata
$PGBIN/initdb -D /tmp/clubhq-pgdata -U postgres -A trust -E UTF8
$PGBIN/pg_ctl -D /tmp/clubhq-pgdata -o "-p 5439 -k /tmp" -l /tmp/clubhq-pg.log start

.venv/bin/python3 supabase/tests/run_migrations.py
.venv/bin/python3 supabase/tests/test_change_notices.py
.venv/bin/python3 supabase/tests/test_cancellation_notices.py
.venv/bin/python3 supabase/tests/test_function_grants.py
.venv/bin/python3 supabase/tests/test_public_rls.py

$PGBIN/pg_ctl -D /tmp/clubhq-pgdata stop -m fast
```

`0029_club_media_per_club_scope.sql` is the **one expected failure**
(`EXPECTED_FAILURES` in `run_migrations.py`) — the harness doesn't implement
`storage.foldername()`, and nothing under test depends on it. Any other
migration failing is real. If the failure list ever contains anything besides
`0029`, stop and investigate before trusting other results in the same run.

## Migration rules (non-negotiable)

- Never rewrite, reorder, squash, rename, or "clean up" an existing migration
  file. Add a new one at the next unused number.
- Do not touch `supabase/migrations/0033_org_types.sql`.
- Never drop `announcements_source_event_id_idx` (`0034`) or
  `announcements_source_cancelled_events_idx` (`0035`) — they back the
  notice-trigger behavior and look unused only because production data is small.
- Production and this repo have diverged before. Never hand-apply SQL to
  production. Migrations + tests go through version control; a production
  deploy is a separate, explicitly authorized step, not a side effect of a
  coding session.
- A table with RLS enabled and zero policies is allowed, but only when it's in
  `ZERO_POLICY_ALLOWLIST` in `supabase/tests/test_public_rls.py` **and** has a
  real `comment on table` explaining why in the migration that left it that way.

## TypeScript conventions

- Strict mode. No `any`, no `as any`, no `@ts-ignore`/`@ts-expect-error`.
  Prefer narrowing or a real type over an assertion.
- `types/database.types.ts` is **generated** (`npm run gen:types`) — the
  schema source of truth. Don't hand-edit it.
- `types/db.ts` is hand-written, ergonomic types for what the app actually
  queries — not a mechanical mirror of the generated file. When the two
  disagree, that's a bug in `db.ts` (as happened with `EventType` and
  `Player.team_id`), not license to duplicate more of the schema by hand.
- `lib/feed.ts` must stay pure: no React, no React Native, no Supabase, no I/O.
  It's tested as a plain function (`lib/feed.test.ts`) precisely because it
  doesn't need a renderer or a database to exercise.

## Linting/formatting scope (read before assuming a check is broken)

- `.prettierignore` deliberately excludes a specific list of pre-existing
  files, not whole directories, added when Prettier was introduced against an
  already-large, unformatted codebase. Reformatting all of it in the same PR
  that added the tool would be unrelated mass churn. Shrink the list as files
  are genuinely touched; don't add new files to it.
- `eslint.config.js` downgrades a few `react-hooks/*` rules (React
  Compiler-era: `set-state-in-effect`, `preserve-manual-memoization`,
  `purity`, `refs`) to `warn` and turns off `react/no-unescaped-entities`
  entirely. Both are documented inline in that file with the reasoning —
  read the comments there before "fixing" the config back to all-errors.

## Working protocol

- **One phase, one session, one PR.** Don't opportunistically start the next
  phase's work because it's adjacent or convenient.
- **Run the checks yourself and show the output.** Never say "done," "should
  pass," or "ready" without the actual command and its actual exit status. If
  something is genuinely blocked by the environment, say exactly what's
  blocked, the exact error, and the smallest human action needed — don't
  paper over it.
- Keep diffs reviewable. Preserve existing behavior unless the current phase
  explicitly says otherwise.
