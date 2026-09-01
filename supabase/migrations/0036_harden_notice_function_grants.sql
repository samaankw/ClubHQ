-- Hardening pass on the functions added in 0034 and 0035.
--
-- Both issues below were flagged by the Supabase database linter immediately
-- after those migrations were applied. Neither is exploitable today, but both
-- are real, and the first one broke a convention the other 13 migrations that
-- define functions all follow.

-- ---------- 1. Pin search_path ----------
--
-- Every SECURITY DEFINER function in this codebase already sets search_path
-- (0022, 0023, 0027, 0030, and the two trigger functions in 0034/0035). The
-- five below were left unpinned and were, between them, the only unpinned
-- functions in the entire database.
--
-- All five are SECURITY INVOKER, so this is not the classic definer
-- privilege-escalation hole — a caller who repoints search_path only reaches
-- objects they already had rights to. It still matters: delete_event and
-- cancel_event_series resolve `events` and `announcements` unqualified, and a
-- session with a hostile search_path would have them operate on shadow tables
-- of the same name, so the RPC would report a successful cancellation while
-- the real session sat untouched on the schedule.

alter function build_event_change_notice(uuid, timestamptz, text, timestamptz, text, text, text)
  set search_path = public;
alter function event_change_notice_window()
  set search_path = public;
alter function build_event_cancellation_notice(text, timestamptz[], text)
  set search_path = public;
alter function delete_event(uuid, boolean)
  set search_path = public;
alter function cancel_event_series(uuid, timestamptz, boolean)
  set search_path = public;

-- ---------- 2. Take back the default PUBLIC execute grant ----------
--
-- Postgres grants EXECUTE on every new function to PUBLIC. The explicit
-- `grant execute ... to authenticated` at the end of 0034/0035 therefore did
-- nothing that wasn't already true, and hid the fact that `anon` — an
-- unauthenticated caller hitting /rest/v1/rpc/ — could reach all of them.
--
-- delete_event and cancel_event_series are the ones that matter: they delete
-- rows. They are SECURITY INVOKER precisely so the events_delete policy from
-- 0019 remains the single authorization rule, and an anon caller is filtered
-- to zero rows and gets the 'not yours to delete' exception. So this is
-- defence in depth rather than a patched hole — but an unauthenticated caller
-- should not be able to reach a delete entry point at all.

revoke all on function delete_event(uuid, boolean) from public;
revoke all on function cancel_event_series(uuid, timestamptz, boolean) from public;
revoke all on function build_event_change_notice(uuid, timestamptz, text, timestamptz, text, text, text) from public;
revoke all on function build_event_cancellation_notice(text, timestamptz[], text) from public;
revoke all on function event_change_notice_window() from public;
revoke all on function update_targeted_event(uuid, text, text, text, timestamptz, text, uuid, uuid[], boolean) from public;

grant execute on function delete_event(uuid, boolean) to authenticated;
grant execute on function cancel_event_series(uuid, timestamptz, boolean) to authenticated;
grant execute on function build_event_change_notice(uuid, timestamptz, text, timestamptz, text, text, text) to authenticated;
grant execute on function build_event_cancellation_notice(text, timestamptz[], text) to authenticated;
grant execute on function event_change_notice_window() to authenticated;
grant execute on function update_targeted_event(uuid, text, text, text, timestamptz, text, uuid, uuid[], boolean) to authenticated;

-- The two trigger functions are revoked from everyone and granted back to
-- nobody. A function returning `trigger` cannot be called directly anyway
-- (Postgres rejects it before the body runs), so this removes an RPC endpoint
-- that could only ever have returned an error.
--
-- This does NOT disable the triggers. EXECUTE on a trigger function is
-- checked when CREATE TRIGGER runs, not each time the trigger fires; the
-- triggers created in 0034/0035 keep working. Verified rather than assumed —
-- see supabase/tests/test_function_grants.py.
revoke all on function announce_event_change() from public, anon, authenticated;
revoke all on function announce_event_cancellation() from public, anon, authenticated;
