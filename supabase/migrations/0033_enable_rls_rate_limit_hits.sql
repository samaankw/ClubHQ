-- ---------------------------------------------------------
-- rate_limit_hits was the one table in `public` created without RLS
-- (0005 added the table; every other table across 0001-0032 enables it).
--
-- Supabase's default privileges grant the `anon` and `authenticated` roles
-- access to tables in `public`, and PostgREST exposes them — so any signed-in
-- user holding the anon key could read this table, and, more importantly,
-- DELETE their own rows to reset the AI rate limits that check_rate_limit()
-- enforces. Those limits are the only cap on generate-development-plan and
-- director-copilot, so clearing them means uncapped Anthropic spend.
--
-- No policies are added deliberately. RLS with zero policies denies every
-- request from anon/authenticated, which is exactly what's wanted here:
--   - check_rate_limit() is SECURITY DEFINER (owner-executed, bypasses RLS)
--   - the edge functions reach it with the service role, which also bypasses RLS
-- so both existing access paths keep working unchanged, and no client-side
-- path to this table remains. No app code queries it directly.
-- ---------------------------------------------------------

alter table rate_limit_hits enable row level security;

-- Belt and braces: even if a future default-privileges change re-grants table
-- access, the client roles have no business touching this table at all.
revoke all on table rate_limit_hits from anon, authenticated;
