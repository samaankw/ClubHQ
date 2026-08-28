-- Storage bucket for public club media (hero video, future marketing assets).
-- Public bucket: objects are served directly via the public URL with no auth
-- required, so no additional SELECT policy is needed. Uploads are done by
-- the developer via the service role key (bypasses RLS), not from the app,
-- so no INSERT policy is defined here yet.
insert into storage.buckets (id, name, public)
values ('club-media', 'club-media', true)
on conflict (id) do nothing;
