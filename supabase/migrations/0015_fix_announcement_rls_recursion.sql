-- 0013 introduced a circular RLS reference: announcements_read checks
-- announcement_player_targets, and announcement_player_targets_read checked
-- back into announcements (for the is_club_staff branch) — Postgres has to
-- apply each table's RLS while evaluating the other's policy, which loops
-- forever ("infinite recursion detected in policy for relation
-- 'announcements'"). Nothing in the app actually needs staff to SELECT
-- announcement_player_targets directly (the edge function reads it via the
-- service-role client, which bypasses RLS entirely), so the fix is just to
-- drop that unused, circular branch — parents of the targeted player is the
-- only read path this table actually needs right now.
drop policy if exists "announcement_player_targets_read" on announcement_player_targets;
create policy "announcement_player_targets_read" on announcement_player_targets for select using (
  exists (select 1 from players pl where pl.id = announcement_player_targets.player_id and pl.parent_id = auth.uid())
);
