-- Announcement categories (for the filter chips: All/Schedule/Weather/
-- Training/Events/General) and expanded targeting (Everyone / Specific
-- Training Group / Selected Players / Selected Parents), for a private
-- training business rather than a multi-team league.

alter table announcements
  add column if not exists category text not null default 'general'
    check (category in (
      'schedule','weather','location','availability','clinic','camp',
      'training_focus','challenge','what_to_bring','holiday','general'
    ));

alter table announcements
  add column if not exists target_type text not null default 'everyone'
    check (target_type in ('everyone','team','players','parents'));

-- Backfill BEFORE adding the consistency check below: existing rows all
-- predate categories/targeting, so infer target_type from whether they
-- already have a team_id (every row defaulted to 'everyone' above).
update announcements set target_type = 'team' where team_id is not null;

-- Keeps team_id and target_type from drifting apart: a 'team'-targeted
-- announcement must carry a team_id, and anything else must not (players/
-- parents targeting is handled via announcement_player_targets below).
alter table announcements
  add constraint announcements_target_type_team_id_check
  check (
    (target_type = 'team' and team_id is not null)
    or (target_type <> 'team' and team_id is null)
  );

-- "Selected Players" / "Selected Parents" targeting. In this schema parents
-- don't have accounts independent of a player record, so both options are
-- backed by the same table — "select parents" just means "select their kids".
create table if not exists announcement_player_targets (
  id uuid primary key default extensions.uuid_generate_v4(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  unique (announcement_id, player_id)
);

alter table announcement_player_targets enable row level security;

create policy "announcement_player_targets_read" on announcement_player_targets for select using (
  exists (select 1 from announcements a where a.id = announcement_player_targets.announcement_id and is_club_staff(a.club_id))
  or exists (select 1 from players pl where pl.id = announcement_player_targets.player_id and pl.parent_id = auth.uid())
);

create policy "announcement_player_targets_write" on announcement_player_targets for insert with check (
  exists (select 1 from announcements a where a.id = announcement_id and a.author_id = auth.uid())
);

-- Extend announcement visibility: a parent can also see an announcement that
-- specifically targets one of their players, even though it has no team_id.
drop policy if exists "announcements_read" on announcements;
create policy "announcements_read" on announcements for select using (
  is_club_staff(club_id)
  or (
    club_id = current_user_club()
    and (
      (target_type = 'everyone')
      or (target_type = 'team' and exists (select 1 from players pl where pl.team_id = announcements.team_id and pl.parent_id = auth.uid()))
      or (
        target_type in ('players','parents')
        and exists (
          select 1 from announcement_player_targets apt
          join players pl on pl.id = apt.player_id
          where apt.announcement_id = announcements.id and pl.parent_id = auth.uid()
        )
      )
    )
  )
);
