-- Drills had no UPDATE/DELETE policy at all — fine while there was no edit
-- UI, but now there is. Scoped to the club's own drills only (club_id not
-- null): the shared starter library (club_id is null) stays untouchable by
-- any single club, same boundary drills_write already draws for inserts.
create policy "drills_update" on drills for update using (
  club_id is not null and (
    added_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = drills.club_id and p.role = 'director')
  )
) with check (
  club_id is not null and (
    added_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = drills.club_id and p.role = 'director')
  )
);

create policy "drills_delete" on drills for delete using (
  club_id is not null and (
    added_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = drills.club_id and p.role = 'director')
  )
);

-- announcements_update only let the original author edit their own post —
-- announcements_delete already lets a director act on anyone's, so a
-- director editing a coach's typo was inconsistently blocked. Match delete's
-- scope now that an edit UI exists.
drop policy if exists "announcements_update" on announcements;
create policy "announcements_update" on announcements for update using (
  author_id = auth.uid()
  or exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = announcements.club_id and p.role = 'director')
) with check (
  author_id = auth.uid()
  or exists (select 1 from profiles p where p.id = auth.uid() and p.club_id = announcements.club_id and p.role = 'director')
);
