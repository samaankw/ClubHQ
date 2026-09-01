-- rate_limit_hits (0005) was created without RLS and was never revisited --
-- production already has RLS disabled here, and this migration brings the
-- repo in line with what should have shipped from the start, not a change
-- to production's current behavior.
--
-- Zero policies is intentional, not an oversight: every read/write to this
-- table goes through check_rate_limit(), a security definer function
-- called only by edge functions with the service role. No authenticated or
-- anon client ever needs, or should have, direct access to it.
alter table rate_limit_hits enable row level security;
revoke all on table rate_limit_hits from anon, authenticated;

comment on table rate_limit_hits is
  'RLS enabled with zero policies, intentional: this table is written and read exclusively through check_rate_limit() (security definer), which callers reach only via edge functions using the service role. anon/authenticated have no grants and are not meant to query it directly. See 0038_rate_limit_hits_rls.sql.';
