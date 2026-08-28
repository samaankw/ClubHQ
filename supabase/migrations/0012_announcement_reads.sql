-- Per-user read tracking for announcements, so the app can show an unread
-- indicator and clear it once a user has opened the Announcements tab —
-- mirrors how group-chat apps (GroupMe, TeamSnap) track "seen" per member
-- rather than per-message-thread, since announcements aren't threaded here.
create table if not exists announcement_reads (
  id uuid primary key default extensions.uuid_generate_v4(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (announcement_id, user_id)
);

alter table announcement_reads enable row level security;

create policy "announcement_reads_select_self" on announcement_reads
  for select using (user_id = auth.uid());

create policy "announcement_reads_insert_self" on announcement_reads
  for insert with check (user_id = auth.uid());

create policy "announcement_reads_update_self" on announcement_reads
  for update using (user_id = auth.uid());
