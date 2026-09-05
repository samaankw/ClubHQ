-- =========================================================
-- Allow club crest uploads, and make these policies testable.
--
-- 0029 scoped the club-media bucket to the only two upload paths that existed
-- at the time:
--     drills/{club_id}/...          (app/manage-drills.tsx)
--     coach-photos/{profile_id}/... (app/(tabs)/profile.tsx)
--
-- Phase 6c then added a third, club-crests/{club_id}/... in
-- app/club-management.tsx, without a matching policy. Every crest upload has
-- therefore failed since that feature shipped, with "new row violates
-- row-level security policy" -- the feature was never functional, rather than
-- having regressed.
--
-- It went unnoticed because 0029 is the single migration the local harness
-- cannot execute: storage.foldername() is not implemented there, so it sits in
-- EXPECTED_FAILURES and every storage policy has been effectively untested.
-- This migration therefore expresses the same prefix checks with a plain LIKE
-- against the object path instead of storage.foldername(), which is equivalent
-- for these paths and, unlike the original, actually runs under test.
--
-- Equivalence, for the record: storage.foldername('drills/abc/1.jpg') yields
-- {drills,abc}, so [1]='drills' and [2]='abc'. `name like 'drills/abc/%'`
-- matches exactly the same objects, including rejecting a near-miss like
-- 'drills/abcdef/1.jpg', because the pattern requires the separator directly
-- after the id.
--
-- Permissions mirror what each path's feature already allows:
--   drills, club-crests -> staff of that club (crest edit is director-only in
--                          0041's clubs UPDATE policy, so crest is too)
--   coach-photos        -> the owner of that profile
-- =========================================================

-- 0014's blanket "any staff may upload anywhere in this bucket" policy is
-- dropped by 0029 -- but only where 0029 actually ran. It cannot run in the
-- local harness, so the policy survives there and, since permissive policies
-- are OR'ed together, it silently permits everything and makes any test of
-- the scoped policies below meaningless. Dropping it here too is a no-op in
-- production and makes this migration self-sufficient wherever it lands.
drop policy if exists "club_media_insert_staff" on storage.objects;
drop policy if exists "club_media_insert_own_club" on storage.objects;
drop policy if exists "club_media_delete_own_club" on storage.objects;

create policy "club_media_insert_own_club" on storage.objects for insert with check (
  bucket_id = 'club-media'
  and exists (
    select 1 from profiles p
    where p.id = (select auth.uid())
      and (
        (p.role in ('coach', 'director') and name like 'drills/' || p.club_id::text || '/%')
        or (p.role = 'director' and name like 'club-crests/' || p.club_id::text || '/%')
        or (p.role in ('coach', 'director') and name like 'coach-photos/' || p.id::text || '/%')
      )
  )
);

create policy "club_media_delete_own_club" on storage.objects for delete using (
  bucket_id = 'club-media'
  and exists (
    select 1 from profiles p
    where p.id = (select auth.uid())
      and (
        (p.role in ('coach', 'director') and name like 'drills/' || p.club_id::text || '/%')
        or (p.role = 'director' and name like 'club-crests/' || p.club_id::text || '/%')
        or (p.role in ('coach', 'director') and name like 'coach-photos/' || p.id::text || '/%')
      )
  )
);
