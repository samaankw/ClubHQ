-- Payment marking is moving onto the event detail page, right alongside
-- attendance — the coach who ran the session is exactly who knows who paid
-- in cash/Venmo that day. Match attendance_records' permission tier (any
-- club staff, not director-only) instead of restricting to directors.
drop policy if exists "player_payments_director_all" on player_payments;

create policy "player_payments_staff_all" on player_payments for all using (
  is_club_staff(player_payments.club_id)
) with check (
  is_club_staff(player_payments.club_id)
);
