-- Payment tracking was staff-only at the RLS level, not just the UI —
-- meaning a parent had no way to see their own child's paid/unpaid status
-- even if the app showed it, because the query would come back empty.
-- Adding a read-only policy for a player's own parent, alongside (not
-- replacing) the existing staff "for all" policy — multiple permissive
-- policies on the same command are OR'd together in Postgres RLS.
create policy "player_payments_parent_read" on player_payments for select using (
  exists (select 1 from players pl where pl.id = player_payments.player_id and pl.parent_id = auth.uid())
);
