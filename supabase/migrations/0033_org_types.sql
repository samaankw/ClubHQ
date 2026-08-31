-- Phase A of the adaptive-shell retrofit (org_type, event taxonomy, team
-- kind). Hidden, not deleted: nothing here removes existing capability, and
-- RLS (is_club_member/is_club_staff) is untouched, matching the retrofit's
-- core constraint that visibility stays presentation-only.

alter table clubs add column if not exists org_type text not null default 'small_club';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clubs_org_type_check'
  ) then
    alter table clubs add constraint clubs_org_type_check
      check (org_type in ('private_trainer', 'academy', 'small_club', 'large_club'));
  end if;
end $$;

-- 'team' is the default for every existing row, matching what they already
-- are today (Williams Soccer Clinic's fake per-age-group teams included --
-- this migration doesn't touch that workaround, Phase B/C do).
alter table teams add column if not exists kind text not null default 'team';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_kind_check'
  ) then
    alter table teams add constraint teams_kind_check
      check (kind in ('team', 'training_group', 'program'));
  end if;
end $$;

-- events.type's CHECK (events_type_check, confirmed against the live
-- database rather than assumed) can't be extended in place -- Postgres
-- requires dropping and recreating it. Re-running this is safe: it ends in
-- the same state every time, just re-does the drop+recreate rather than a
-- true no-op skip.
alter table events drop constraint if exists events_type_check;
alter table events add constraint events_type_check
  check (type in ('practice', 'game', 'tournament', 'club_event', 'private_session', 'small_group', 'clinic', 'camp'));
