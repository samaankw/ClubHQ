-- NOTE: superseded — voice evaluation now transcribes on-device (no audio upload,
-- no Whisper cost), so this bucket is no longer used by the app. Left in place
-- (rather than renumbering migrations) in case you already applied it; safe to
-- skip entirely on a fresh project, or drop the bucket later if you don't need it
-- for anything else.
--
-- Storage bucket for voice-note recordings (private; coaches upload, edge function reads)
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

create policy "voice_notes_upload" on storage.objects
  for insert with check (bucket_id = 'voice-notes' and auth.role() = 'authenticated');

create policy "voice_notes_read_own" on storage.objects
  for select using (bucket_id = 'voice-notes' and auth.role() = 'authenticated');
