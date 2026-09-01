-- Finishes what 0036 started. 0036 was necessary but not sufficient.
--
-- 0036 revoked EXECUTE `from public` on the six callable functions added in
-- 0034/0035. On a bare Postgres cluster that is enough, because the only
-- thing granting EXECUTE is the implicit PUBLIC grant. It was verified that
-- way in supabase/tests/test_function_grants.py and it passed.
--
-- It did not work on the real project. A hosted Supabase project ships with
--
--   alter default privileges in schema public
--     grant all on functions to postgres, anon, authenticated, service_role;
--
-- so every function a migration creates gets a grant to `anon` in its own
-- right, entirely separate from the PUBLIC grant. Revoking PUBLIC leaves that
-- one untouched. After 0036 was applied, production still reported
-- has_function_privilege('anon', 'delete_event(uuid, boolean)', 'EXECUTE')
-- = true, while the same query locally returned false.
--
-- The two trigger functions were already correct after 0036, because those
-- were revoked from `anon` and `authenticated` by name rather than relying on
-- PUBLIC. That inconsistency inside a single migration is what made the gap
-- easy to miss.
--
-- The harness has since been taught to apply the same default privileges
-- (supabase/tests/run_migrations.py), so this class of mistake now fails
-- locally instead of only in production.

revoke execute on function delete_event(uuid, boolean) from anon;
revoke execute on function cancel_event_series(uuid, timestamptz, boolean) from anon;
revoke execute on function build_event_change_notice(uuid, timestamptz, text, timestamptz, text, text, text) from anon;
revoke execute on function build_event_cancellation_notice(text, timestamptz[], text) from anon;
revoke execute on function event_change_notice_window() from anon;
revoke execute on function update_targeted_event(uuid, text, text, text, timestamptz, text, uuid, uuid[], boolean) from anon;

-- Belt and braces: default privileges also hand these to service_role, which
-- is the key the edge functions hold. That one is intentional and stays --
-- send-announcement-push runs as service_role. Only `anon` is removed here.
