-- club_media_insert_staff only checked "are you club staff" — any coach or
-- director, from any club, could upload under any path, including another
-- club's. Harmless with a single club today, but the two paths actually in
-- use are both prefixed identifiably enough to scope properly:
--   drills/{club_id}/...        (app/manage-drills.tsx)
--   coach-photos/{profile_id}/... (app/(tabs)/profile.tsx)
-- storage.foldername(name) splits the object path on "/" — index 1 is the
-- top-level folder, index 2 is the club/profile id segment.
drop policy if exists "club_media_insert_staff" on storage.objects;

create policy "club_media_insert_own_club" on storage.objects for insert with check (
  bucket_id = 'club-media'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('coach', 'director')
      and (
        ((storage.foldername(name))[1] = 'drills' and (storage.foldername(name))[2] = p.club_id::text)
        or ((storage.foldername(name))[1] = 'coach-photos' and (storage.foldername(name))[2] = p.id::text)
      )
  )
);

-- No delete/update flow exists yet for either path, but scoping it the same
-- way now means a future "remove this drill video" feature is safe by
-- default instead of needing this same fix again later.
create policy "club_media_delete_own_club" on storage.objects for delete using (
  bucket_id = 'club-media'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('coach', 'director')
      and (
        ((storage.foldername(name))[1] = 'drills' and (storage.foldername(name))[2] = p.club_id::text)
        or ((storage.foldername(name))[1] = 'coach-photos' and (storage.foldername(name))[2] = p.id::text)
      )
  )
);
