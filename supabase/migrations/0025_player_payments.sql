-- Lightweight payment tracking — deliberately NOT a payment processor. No
-- money moves through the app; this just lets a director mark whether a
-- player's monthly training fee has been paid (however they actually pay:
-- Venmo, cash, Zelle), so "who owes for this month" is a glance instead of
-- a mental tally. One row per player per calendar month.
create table if not exists player_payments (
  id uuid primary key default extensions.uuid_generate_v4(),
  player_id uuid not null references players(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  period text not null, -- 'YYYY-MM'
  status text not null default 'unpaid' check (status in ('paid', 'unpaid')),
  amount numeric(10, 2),
  note text,
  marked_by uuid references profiles(id),
  marked_at timestamptz default now(),
  unique (player_id, period)
);

alter table player_payments enable row level security;

-- club-management.tsx (where this is used) is already director-only, so
-- payment visibility/editing mirrors that exactly rather than introducing
-- a separate coach-facing permission tier for financial data.
create policy "player_payments_director_all" on player_payments for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director' and p.club_id = player_payments.club_id)
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director' and p.club_id = player_payments.club_id)
);
