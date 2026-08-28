-- Two things bundled here because they're the same feature:
--
-- 1. send-event-push and send-announcement-push have both been filtering
--    push_tokens on `.eq("enabled", true)` since they were written, but no
--    migration ever created that column — so every push send has been
--    silently returning zero recipients (no error, since the client code
--    doesn't check for a query error before falling back to an empty
--    array). Adding the column, defaulted true, actually turns push
--    notifications on for the first time as a side effect of this fix.
--
-- 2. The actual feature requested: letting a user turn off event or
--    announcement pushes independently, without revoking OS-level
--    notification permission entirely.
alter table push_tokens add column if not exists enabled boolean not null default true;

alter table profiles add column if not exists notify_events boolean not null default true;
alter table profiles add column if not exists notify_announcements boolean not null default true;
