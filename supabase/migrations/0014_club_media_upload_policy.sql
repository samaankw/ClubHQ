-- The "club-media" bucket (0011_club_media_storage.sql) was created public-read
-- but had no INSERT policy, so only the service-role key could upload to it —
-- fine for the one-off hero-video upload, but the in-app drill video upload
-- flow runs as the signed-in coach/director, not the service role.
create policy "club_media_insert_staff" on storage.objects for insert with check (
  bucket_id = 'club-media'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('coach', 'director'))
);
