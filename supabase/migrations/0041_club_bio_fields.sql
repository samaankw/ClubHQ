-- Phase 6c: move ClubBioSection's content off hardcoded Williams-specific
-- text and onto real per-club fields, so a different club's app doesn't
-- show someone else's founding story. crest_url already existed (added for
-- club-media uploads) but was never actually wired to anything; this adds
-- the missing bio text column and lets it actually be edited.

alter table clubs add column if not exists bio text;

-- set_member_role (0004_security_hardening.sql) already lets an existing
-- director promote another member to director, so a multi-director club is
-- a real, reachable state -- but the UPDATE policy only ever checked
-- owner_id, meaning a promoted (non-owner) director could never edit their
-- own club's bio/crest. Widened to any director of the club, not just the
-- literal owner.
alter policy "clubs_update_owner" on public.clubs
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from profiles p
      where p.id = (select auth.uid()) and p.club_id = clubs.id and p.role = 'director'
    )
  );

-- Column-level grant, same defensive pattern 0007_review_fixes.sql already
-- applies to announcements/events: RLS controls WHICH row a director can
-- touch, but nothing before this stopped that same UPDATE from also
-- rewriting org_type, owner_id, join_code, or timezone. Only the fields this
-- feature actually lets someone edit are writable now.
revoke update on clubs from authenticated;
grant update (name, crest_url, bio) on clubs to authenticated;
