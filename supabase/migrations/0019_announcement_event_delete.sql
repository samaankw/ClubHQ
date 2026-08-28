-- Neither table had a DELETE policy at all, so nobody — not even a
-- director — could actually delete an announcement or event, regardless of
-- what the UI offered. Mirrors the existing update policies: the
-- author/creator can delete their own, and directors can delete anything in
-- their own club (same authority they already have over teams/players in
-- club-management).
create policy "announcements_delete" on announcements for delete using (
  author_id = auth.uid()
  or exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = announcements.club_id and p.role = 'director')
);

create policy "events_delete" on events for delete using (
  created_by = auth.uid()
  or exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = events.club_id and p.role = 'director')
);
