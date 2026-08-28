-- Tracks each time a development report is viewed, so directors can see real
-- engagement (not just "the feature exists") during the pilot.
create table if not exists report_views (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid references players(id) on delete cascade,
  viewer_id uuid references profiles(id),
  created_at timestamptz default now()
);

alter table report_views enable row level security;

-- Anyone who can already see the player (RLS on players handles that) can log a view
create policy "report_views_insert" on report_views for insert with check (
  viewer_id = auth.uid()
  and exists (
    select 1 from players pl join teams t on t.id = pl.team_id where pl.id = report_views.player_id and is_club_member(t.club_id)
  )
);

-- Only club staff can read the aggregate view data (it's a pilot metric, not something a
-- parent needs to see about themselves)
create policy "report_views_read" on report_views for select using (
  exists (
    select 1 from players pl join teams t on t.id = pl.team_id where pl.id = report_views.player_id and is_club_staff(t.club_id)
  )
);
