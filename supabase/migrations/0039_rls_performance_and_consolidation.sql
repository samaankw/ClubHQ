-- Phase 5: RLS performance hardening + FK indexes + policy consolidation.
--
-- Evidence for every number below was re-queried live against this repo's own
-- migration set (all 38 prior migrations applied to a fresh Postgres 18
-- instance) immediately before writing this file -- not copied from an old
-- audit. See supabase/tests/test_public_rls.py and run_migrations.py for how
-- to reproduce.

-- ---------------------------------------------------------------------------
-- 1. Helper functions: wrap auth.uid() in a scalar subquery.
--
-- Per-row RLS evaluation calls these on every row checked. A bare auth.uid()
-- re-evaluates per row; `(select auth.uid())` lets Postgres's planner treat it
-- as an InitPlan, evaluated once per statement instead. Same behavior, just
-- hoistable.
-- ---------------------------------------------------------------------------

create or replace function public.is_club_member(target_club uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = (select auth.uid()) and p.club_id = target_club
  );
$$;

create or replace function public.is_club_staff(target_club uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = (select auth.uid())
      and p.club_id = target_club
      and p.role in ('coach', 'director')
  );
$$;

create or replace function public.current_user_club()
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select club_id from profiles where id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 2. Policies with their own bare auth.uid()/auth.jwt() call (54 of the 55
-- found live; the 55th, player_payments_parent_read, is folded into the
-- player_payments consolidation in section 3 instead of altered in place).
-- Each ALTER POLICY below reproduces the policy's existing USING/WITH CHECK
-- verbatim except for wrapping bare auth.uid() calls in `(select ...)` --
-- no behavior change, only how the planner can evaluate the call.
-- ---------------------------------------------------------------------------

alter policy "announcement_player_targets_read" on public.announcement_player_targets
  using ((EXISTS ( SELECT 1
   FROM players pl
  WHERE ((pl.id = announcement_player_targets.player_id) AND (pl.parent_id = ( SELECT auth.uid() ))))));

alter policy "announcement_player_targets_write" on public.announcement_player_targets
  with check ((EXISTS ( SELECT 1
   FROM announcements a
  WHERE ((a.id = announcement_player_targets.announcement_id) AND (a.author_id = ( SELECT auth.uid() ))))));

alter policy "announcement_reads_insert_self" on public.announcement_reads
  with check ((user_id = ( SELECT auth.uid() )));

alter policy "announcement_reads_select_self" on public.announcement_reads
  using ((user_id = ( SELECT auth.uid() )));

alter policy "announcement_reads_update_self" on public.announcement_reads
  using ((user_id = ( SELECT auth.uid() )));

alter policy "announcements_delete" on public.announcements
  using (((author_id = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = announcements.club_id) AND (p.role = 'director'::text))))));

alter policy "announcements_read" on public.announcements
  using ((is_club_staff(club_id) OR ((club_id = current_user_club()) AND ((target_type = 'everyone'::text) OR ((target_type = 'team'::text) AND (EXISTS ( SELECT 1
   FROM players pl
  WHERE ((pl.team_id = announcements.team_id) AND (pl.parent_id = ( SELECT auth.uid() )))))) OR ((target_type = ANY (ARRAY['players'::text, 'parents'::text])) AND (EXISTS ( SELECT 1
   FROM (announcement_player_targets apt
     JOIN players pl ON ((pl.id = apt.player_id)))
  WHERE ((apt.announcement_id = announcements.id) AND (pl.parent_id = ( SELECT auth.uid() ))))))))));

alter policy "announcements_update" on public.announcements
  using (((author_id = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = announcements.club_id) AND (p.role = 'director'::text))))))
  with check (((author_id = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = announcements.club_id) AND (p.role = 'director'::text))))));

alter policy "announcements_write" on public.announcements
  with check (((author_id = ( SELECT auth.uid() )) AND (club_id = current_user_club()) AND ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.role = 'director'::text)))) OR ((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM team_coaches tc
  WHERE ((tc.team_id = announcements.team_id) AND (tc.coach_id = ( SELECT auth.uid() )))))))));

alter policy "attendance_insert_staff" on public.attendance_records
  with check (((marked_by = ( SELECT auth.uid() )) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = attendance_records.event_id) AND is_club_staff(e.club_id))))));

alter policy "attendance_read" on public.attendance_records
  using ((EXISTS ( SELECT 1
   FROM (events e
     JOIN players pl ON ((pl.id = attendance_records.player_id)))
  WHERE ((e.id = attendance_records.event_id) AND (is_club_staff(e.club_id) OR (pl.parent_id = ( SELECT auth.uid() )))))));

alter policy "attendance_update_staff" on public.attendance_records
  using ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = attendance_records.event_id) AND is_club_staff(e.club_id)))))
  with check (((marked_by = ( SELECT auth.uid() )) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = attendance_records.event_id) AND is_club_staff(e.club_id))))));

alter policy "clubs_insert_owner" on public.clubs
  with check ((owner_id = ( SELECT auth.uid() )));

alter policy "clubs_read" on public.clubs
  using ((is_club_member(id) OR (owner_id = ( SELECT auth.uid() ))));

alter policy "clubs_update_owner" on public.clubs
  using ((owner_id = ( SELECT auth.uid() )));

alter policy "consent_records_insert_self" on public.consent_records
  with check ((user_id = ( SELECT auth.uid() )));

alter policy "consent_records_read_self" on public.consent_records
  using (((user_id = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = consent_records.user_id) AND (p.club_id = ( SELECT profiles.club_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() )))) AND (( SELECT profiles.role
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() ))) = 'director'::text))))));

alter policy "conv_participants_read" on public.conversation_participants
  using ((profile_id = ( SELECT auth.uid() )));

alter policy "conversations_read" on public.conversations
  using ((EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = conversations.id) AND (cp.profile_id = ( SELECT auth.uid() ))))));

alter policy "dev_plans_read" on public.development_plans
  using ((EXISTS ( SELECT 1
   FROM (players pl
     JOIN teams t ON ((t.id = pl.team_id)))
  WHERE ((pl.id = development_plans.player_id) AND (is_club_staff(t.club_id) OR ((pl.parent_id = ( SELECT auth.uid() )) AND (development_plans.status = 'published'::text)))))));

alter policy "drills_delete" on public.drills
  using (((club_id IS NOT NULL) AND ((added_by = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = drills.club_id) AND (p.role = 'director'::text)))))));

alter policy "drills_update" on public.drills
  using (((club_id IS NOT NULL) AND ((added_by = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = drills.club_id) AND (p.role = 'director'::text)))))))
  with check (((club_id IS NOT NULL) AND ((added_by = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = drills.club_id) AND (p.role = 'director'::text)))))));

alter policy "drills_write" on public.drills
  with check (((club_id IS NOT NULL) AND is_club_staff(club_id) AND (added_by = ( SELECT auth.uid() ))));

alter policy "evaluations_read" on public.evaluations
  using ((EXISTS ( SELECT 1
   FROM (players pl
     JOIN teams t ON ((t.id = pl.team_id)))
  WHERE ((pl.id = evaluations.player_id) AND ((pl.parent_id = ( SELECT auth.uid() )) OR is_club_staff(t.club_id))))));

alter policy "evaluations_write" on public.evaluations
  with check (((coach_id = ( SELECT auth.uid() )) AND (EXISTS ( SELECT 1
   FROM (players pl
     JOIN teams t ON ((t.id = pl.team_id)))
  WHERE ((pl.id = evaluations.player_id) AND is_club_staff(t.club_id))))));

alter policy "event_players_read" on public.event_players
  using ((is_club_staff(club_id) OR (EXISTS ( SELECT 1
   FROM players pl
  WHERE ((pl.id = event_players.player_id) AND (pl.parent_id = ( SELECT auth.uid() )))))));

alter policy "event_rsvps_insert" on public.event_rsvps
  with check ((EXISTS ( SELECT 1
   FROM (events e
     JOIN players pl ON ((pl.id = event_rsvps.player_id)))
  WHERE ((e.id = event_rsvps.event_id) AND (is_club_staff(e.club_id) OR (pl.parent_id = ( SELECT auth.uid() )))))));

alter policy "event_rsvps_read" on public.event_rsvps
  using ((EXISTS ( SELECT 1
   FROM (events e
     JOIN players pl ON ((pl.id = event_rsvps.player_id)))
  WHERE ((e.id = event_rsvps.event_id) AND (is_club_staff(e.club_id) OR (pl.parent_id = ( SELECT auth.uid() )))))));

alter policy "event_rsvps_update" on public.event_rsvps
  using ((EXISTS ( SELECT 1
   FROM (events e
     JOIN players pl ON ((pl.id = event_rsvps.player_id)))
  WHERE ((e.id = event_rsvps.event_id) AND (is_club_staff(e.club_id) OR (pl.parent_id = ( SELECT auth.uid() )))))))
  with check ((EXISTS ( SELECT 1
   FROM (events e
     JOIN players pl ON ((pl.id = event_rsvps.player_id)))
  WHERE ((e.id = event_rsvps.event_id) AND (is_club_staff(e.club_id) OR (pl.parent_id = ( SELECT auth.uid() )))))));

alter policy "events_delete" on public.events
  using (((created_by = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = events.club_id) AND (p.role = 'director'::text))))));

alter policy "events_read" on public.events
  using ((is_club_staff(club_id) OR ((club_id = current_user_club()) AND (((team_id IS NULL) AND (NOT (EXISTS ( SELECT 1
   FROM event_players ep
  WHERE (ep.event_id = events.id))))) OR (EXISTS ( SELECT 1
   FROM players pl
  WHERE ((pl.team_id = events.team_id) AND (pl.parent_id = ( SELECT auth.uid() ))))) OR (EXISTS ( SELECT 1
   FROM (event_players ep
     JOIN players pl ON ((pl.id = ep.player_id)))
  WHERE ((ep.event_id = events.id) AND (pl.parent_id = ( SELECT auth.uid() )))))))));

alter policy "events_update" on public.events
  using (((club_id = current_user_club()) AND ((created_by = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.role = 'director'::text)))) OR (EXISTS ( SELECT 1
   FROM team_coaches tc
  WHERE ((tc.team_id = events.team_id) AND (tc.coach_id = ( SELECT auth.uid() ))))))))
  with check (((club_id = current_user_club()) AND ((created_by = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.role = 'director'::text)))) OR (EXISTS ( SELECT 1
   FROM team_coaches tc
  WHERE ((tc.team_id = events.team_id) AND (tc.coach_id = ( SELECT auth.uid() ))))))));

alter policy "events_write" on public.events
  with check (((created_by = ( SELECT auth.uid() )) AND (club_id = current_user_club()) AND ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.role = 'director'::text)))) OR ((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM team_coaches tc
  WHERE ((tc.team_id = events.team_id) AND (tc.coach_id = ( SELECT auth.uid() )))))))));

alter policy "homework_read" on public.homework_items
  using ((EXISTS ( SELECT 1
   FROM ((players pl
     JOIN teams t ON ((t.id = pl.team_id)))
     JOIN development_plans dp ON ((dp.id = homework_items.development_plan_id)))
  WHERE ((pl.id = homework_items.player_id) AND (is_club_staff(t.club_id) OR ((pl.parent_id = ( SELECT auth.uid() )) AND (dp.status = 'published'::text)))))));

alter policy "homework_update_complete" on public.homework_items
  using ((EXISTS ( SELECT 1
   FROM players pl
  WHERE ((pl.id = homework_items.player_id) AND (pl.parent_id = ( SELECT auth.uid() ))))));

alter policy "messages_read" on public.messages
  using ((EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.profile_id = ( SELECT auth.uid() ))))));

alter policy "messages_write" on public.messages
  with check (((sender_id = ( SELECT auth.uid() )) AND (EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.profile_id = ( SELECT auth.uid() )))))));

alter policy "parent_link_codes_director_read" on public.parent_link_codes
  using ((EXISTS ( SELECT 1
   FROM ((players pl
     JOIN teams t ON ((t.id = pl.team_id)))
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() ))))
  WHERE ((pl.id = parent_link_codes.player_id) AND (p.club_id = t.club_id) AND (p.role = 'director'::text)))));

alter policy "players_delete_director" on public.players
  using ((EXISTS ( SELECT 1
   FROM (teams t
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() ))))
  WHERE ((t.id = players.team_id) AND (p.club_id = t.club_id) AND (p.role = 'director'::text)))));

alter policy "players_insert_staff" on public.players
  with check ((EXISTS ( SELECT 1
   FROM (teams t
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() ))))
  WHERE ((t.id = players.team_id) AND (p.club_id = t.club_id) AND (p.role = 'director'::text)))));

alter policy "players_read" on public.players
  using (((parent_id = ( SELECT auth.uid() )) OR (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = players.team_id) AND is_club_staff(t.club_id))))));

alter policy "players_update_staff" on public.players
  using ((EXISTS ( SELECT 1
   FROM (teams t
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() ))))
  WHERE ((t.id = players.team_id) AND (p.club_id = t.club_id) AND (p.role = 'director'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM (teams t
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() ))))
  WHERE ((t.id = players.team_id) AND (p.club_id = t.club_id) AND (p.role = 'director'::text)))));

alter policy "profiles_insert_self" on public.profiles
  with check (((id = ( SELECT auth.uid() )) AND (role = ANY (ARRAY['coach'::text, 'parent'::text])) AND (club_id IS NULL)));

alter policy "profiles_self" on public.profiles
  using (((id = ( SELECT auth.uid() )) OR ((club_id IS NOT NULL) AND (club_id = current_user_club()))));

alter policy "profiles_update_self" on public.profiles
  using ((id = ( SELECT auth.uid() )));

alter policy "push_tokens_self_delete" on public.push_tokens
  using ((user_id = ( SELECT auth.uid() )));

alter policy "push_tokens_self_insert" on public.push_tokens
  with check ((user_id = ( SELECT auth.uid() )));

alter policy "push_tokens_self_read" on public.push_tokens
  using ((user_id = ( SELECT auth.uid() )));

alter policy "push_tokens_self_update" on public.push_tokens
  using ((user_id = ( SELECT auth.uid() )))
  with check ((user_id = ( SELECT auth.uid() )));

alter policy "report_views_insert" on public.report_views
  with check (((viewer_id = ( SELECT auth.uid() )) AND (EXISTS ( SELECT 1
   FROM (players pl
     JOIN teams t ON ((t.id = pl.team_id)))
  WHERE ((pl.id = report_views.player_id) AND is_club_member(t.club_id))))));

alter policy "role_change_log_read" on public.role_change_log
  using (((club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = role_change_log.club_id) AND (p.role = 'director'::text))))));

alter policy "teams_delete_director" on public.teams
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = teams.club_id) AND (p.role = 'director'::text)))));

alter policy "teams_update_director" on public.teams
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = teams.club_id) AND (p.role = 'director'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = teams.club_id) AND (p.role = 'director'::text)))));

alter policy "teams_write_staff" on public.teams
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() )) AND (p.club_id = teams.club_id) AND (p.role = 'director'::text)))));

-- ---------------------------------------------------------------------------
-- 3. player_payments: collapse two overlapping permissive SELECT policies
-- (player_payments_parent_read + the SELECT half of player_payments_staff_all)
-- into one, so Postgres evaluates a single permissive policy for SELECT
-- instead of OR-ing two. Staff INSERT/UPDATE/DELETE become their own policies
-- instead of riding along on a blanket ALL policy that also granted SELECT.
-- ---------------------------------------------------------------------------

drop policy "player_payments_parent_read" on public.player_payments;
drop policy "player_payments_staff_all" on public.player_payments;

create policy "player_payments_read" on public.player_payments
for select
using (
  is_club_staff(club_id)
  or exists (
    select 1 from players pl
    where pl.id = player_payments.player_id
      and pl.parent_id = (select auth.uid())
  )
);

create policy "player_payments_staff_insert" on public.player_payments
for insert
with check (is_club_staff(club_id));

create policy "player_payments_staff_update" on public.player_payments
for update
using (is_club_staff(club_id))
with check (is_club_staff(club_id));

create policy "player_payments_staff_delete" on public.player_payments
for delete
using (is_club_staff(club_id));

-- ---------------------------------------------------------------------------
-- 4. Indexes for the 44 foreign keys with no covering index -- confirmed live
-- against the actual current schema, not the original stale audit list.
-- Tables are all still small (this is a pre-launch app), so this is the cheap
-- moment to add these; every one of these becomes a sequential-scan-on-delete
-- risk once the referenced tables grow.
-- ---------------------------------------------------------------------------

create index if not exists "announcement_player_targets_player_id_idx" on public.announcement_player_targets (player_id);
create index if not exists "announcement_reads_user_id_idx" on public.announcement_reads (user_id);
create index if not exists "announcements_author_id_idx" on public.announcements (author_id);
create index if not exists "announcements_club_id_idx" on public.announcements (club_id);
create index if not exists "announcements_team_id_idx" on public.announcements (team_id);
create index if not exists "attendance_records_marked_by_idx" on public.attendance_records (marked_by);
create index if not exists "attendance_records_player_id_idx" on public.attendance_records (player_id);
create index if not exists "clubs_owner_id_idx" on public.clubs (owner_id);
create index if not exists "consent_records_player_id_idx" on public.consent_records (player_id);
create index if not exists "consent_records_user_id_idx" on public.consent_records (user_id);
create index if not exists "conversation_participants_profile_id_idx" on public.conversation_participants (profile_id);
create index if not exists "conversations_club_id_idx" on public.conversations (club_id);
create index if not exists "conversations_team_id_idx" on public.conversations (team_id);
create index if not exists "development_plans_evaluation_id_idx" on public.development_plans (evaluation_id);
create index if not exists "development_plans_player_id_idx" on public.development_plans (player_id);
create index if not exists "development_plans_reviewed_by_idx" on public.development_plans (reviewed_by);
create index if not exists "drills_added_by_idx" on public.drills (added_by);
create index if not exists "drills_club_id_idx" on public.drills (club_id);
create index if not exists "evaluations_coach_id_idx" on public.evaluations (coach_id);
create index if not exists "evaluations_player_id_idx" on public.evaluations (player_id);
create index if not exists "event_players_club_id_idx" on public.event_players (club_id);
create index if not exists "event_players_player_id_idx" on public.event_players (player_id);
create index if not exists "event_rsvps_player_id_idx" on public.event_rsvps (player_id);
create index if not exists "events_club_id_idx" on public.events (club_id);
create index if not exists "events_created_by_idx" on public.events (created_by);
create index if not exists "events_series_id_idx" on public.events (series_id);
create index if not exists "events_team_id_idx" on public.events (team_id);
create index if not exists "homework_items_development_plan_id_idx" on public.homework_items (development_plan_id);
create index if not exists "homework_items_drill_id_idx" on public.homework_items (drill_id);
create index if not exists "homework_items_player_id_idx" on public.homework_items (player_id);
create index if not exists "messages_conversation_id_idx" on public.messages (conversation_id);
create index if not exists "messages_sender_id_idx" on public.messages (sender_id);
create index if not exists "parent_link_codes_claimed_by_idx" on public.parent_link_codes (claimed_by);
create index if not exists "parent_link_codes_created_by_idx" on public.parent_link_codes (created_by);
create index if not exists "parent_link_codes_player_id_idx" on public.parent_link_codes (player_id);
create index if not exists "player_payments_club_id_idx" on public.player_payments (club_id);
create index if not exists "player_payments_marked_by_idx" on public.player_payments (marked_by);
create index if not exists "players_parent_id_idx" on public.players (parent_id);
create index if not exists "players_team_id_idx" on public.players (team_id);
create index if not exists "profiles_club_id_idx" on public.profiles (club_id);
create index if not exists "report_views_player_id_idx" on public.report_views (player_id);
create index if not exists "report_views_viewer_id_idx" on public.report_views (viewer_id);
create index if not exists "team_coaches_coach_id_idx" on public.team_coaches (coach_id);
create index if not exists "teams_club_id_idx" on public.teams (club_id);
