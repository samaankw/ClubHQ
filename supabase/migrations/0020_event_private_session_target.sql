-- Events could only ever target a team or the whole club, with no way to
-- schedule (and clearly label) a 1:1 private training session — despite
-- that being core to how Williams Soccer Clinic actually trains players.
-- Coaches/directors couldn't tell events apart in the schedule beyond the
-- title either, since nothing surfaced who an event was actually for.
alter table events add column if not exists player_id uuid references players(id) on delete cascade;

alter table events drop constraint if exists events_single_target;
alter table events add constraint events_single_target check (not (team_id is not null and player_id is not null));

-- Parents also need to see private sessions scheduled for their own child.
drop policy if exists "events_read" on events;
create policy "events_read" on events for select using (
  is_club_staff(club_id)
  or (
    club_id = current_user_club()
    and (
      (team_id is null and player_id is null)
      or exists (select 1 from players pl where pl.team_id = events.team_id and pl.parent_id = auth.uid())
      or exists (select 1 from players pl where pl.id = events.player_id and pl.parent_id = auth.uid())
    )
  )
);

-- Coaches may create a private session for any player on a team they coach,
-- same scope they already have for team events.
drop policy if exists "events_write" on events;
create policy "events_write" on events for insert with check (
  created_by = auth.uid()
  and club_id = current_user_club()
  and (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director')
    or (
      team_id is not null
      and exists (select 1 from team_coaches tc where tc.team_id = events.team_id and tc.coach_id = auth.uid())
    )
    or (
      player_id is not null
      and exists (
        select 1 from players pl
        join team_coaches tc on tc.team_id = pl.team_id
        where pl.id = events.player_id and tc.coach_id = auth.uid()
      )
    )
  )
);

drop policy if exists "events_update" on events;
create policy "events_update" on events for update using (
  club_id = current_user_club()
  and (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director')
    or exists (select 1 from team_coaches tc where tc.team_id = events.team_id and tc.coach_id = auth.uid())
    or exists (
      select 1 from players pl
      join team_coaches tc on tc.team_id = pl.team_id
      where pl.id = events.player_id and tc.coach_id = auth.uid()
    )
  )
) with check (
  club_id = current_user_club()
  and (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director')
    or exists (select 1 from team_coaches tc where tc.team_id = events.team_id and tc.coach_id = auth.uid())
    or exists (
      select 1 from players pl
      join team_coaches tc on tc.team_id = pl.team_id
      where pl.id = events.player_id and tc.coach_id = auth.uid()
    )
  )
);
