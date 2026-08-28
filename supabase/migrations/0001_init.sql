-- =========================================================
-- ClubHQ core schema
-- Roles: director, coach, parent, player
-- =========================================================

create extension if not exists "uuid-ossp";

-- ---------- Profiles (1:1 with auth.users) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('director','coach','parent','player')),
  avatar_url text,
  club_id uuid,
  created_at timestamptz default now()
);

-- ---------- Clubs ----------
create table if not exists clubs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  crest_url text,
  owner_id uuid references profiles(id),
  created_at timestamptz default now()
);

alter table profiles add constraint profiles_club_fk
  foreign key (club_id) references clubs(id) on delete set null;

-- ---------- Teams ----------
create table if not exists teams (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid references clubs(id) on delete cascade,
  name text not null,           -- e.g. "U10 Boys Red"
  age_group text,
  season text,
  created_at timestamptz default now()
);

-- Coach <-> Team
create table if not exists team_coaches (
  team_id uuid references teams(id) on delete cascade,
  coach_id uuid references profiles(id) on delete cascade,
  primary key (team_id, coach_id)
);

-- ---------- Players ----------
create table if not exists players (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid references teams(id) on delete cascade,
  parent_id uuid references profiles(id) on delete set null,
  full_name text not null,
  birth_date date,
  position text,
  photo_url text,
  created_at timestamptz default now()
);

-- ---------- Announcements ----------
create table if not exists announcements (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid references clubs(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade, -- null = club-wide
  author_id uuid references profiles(id),
  title text not null,
  body text not null,
  pinned boolean default false,
  created_at timestamptz default now()
);

-- ---------- Schedule (practices, games, events) ----------
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid references clubs(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade, -- null = club-wide event
  type text not null check (type in ('practice','game','tournament','club_event')),
  title text not null,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists event_rsvps (
  event_id uuid references events(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  status text check (status in ('yes','no','maybe','no_response')) default 'no_response',
  primary key (event_id, player_id)
);

-- ---------- Messaging ----------
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid references clubs(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  type text check (type in ('team_group','direct')) default 'team_group',
  created_at timestamptz default now()
);

create table if not exists conversation_participants (
  conversation_id uuid references conversations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  primary key (conversation_id, profile_id)
);

create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id uuid references profiles(id),
  body text not null,
  created_at timestamptz default now()
);

-- ---------- Evaluations ----------
create table if not exists evaluations (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid references players(id) on delete cascade,
  coach_id uuid references profiles(id),
  first_touch int check (first_touch between 1 and 10),
  passing int check (passing between 1 and 10),
  dribbling int check (dribbling between 1 and 10),
  weak_foot int check (weak_foot between 1 and 10),
  finishing int check (finishing between 1 and 10),
  decision_making int check (decision_making between 1 and 10),
  scanning int check (scanning between 1 and 10),
  speed int check (speed between 1 and 10),
  positioning int check (positioning between 1 and 10),
  coach_notes text,           -- free text or transcribed voice note
  source text default 'manual' check (source in ('manual','voice')),
  created_at timestamptz default now()
);

-- ---------- AI-generated development plans ----------
create table if not exists development_plans (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid references players(id) on delete cascade,
  evaluation_id uuid references evaluations(id) on delete cascade,
  priorities jsonb not null,      -- e.g. [{"skill":"weak_foot","note":"..."}]
  summary text,                   -- parent-facing plain-language summary
  overall_score_before int,
  overall_score_after int,
  week_start date,
  created_at timestamptz default now()
);

-- ---------- Homework (at-home training assignments) ----------
create table if not exists homework_items (
  id uuid primary key default uuid_generate_v4(),
  development_plan_id uuid references development_plans(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  day_of_week text,               -- 'Mon','Wed','Fri' etc
  title text not null,
  description text,
  completed boolean default false,
  completed_at timestamptz
);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table profiles enable row level security;
alter table clubs enable row level security;
alter table teams enable row level security;
alter table team_coaches enable row level security;
alter table players enable row level security;
alter table announcements enable row level security;
alter table events enable row level security;
alter table event_rsvps enable row level security;
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;
alter table evaluations enable row level security;
alter table development_plans enable row level security;
alter table homework_items enable row level security;

-- Helper: is the current user a member (any role) of this club
create or replace function is_club_member(target_club uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.club_id = target_club
  );
$$;

-- Profiles: user can read/update own row, and read others in same club
create policy "profiles_self" on profiles for select using (id = auth.uid() or club_id = (select club_id from profiles where id = auth.uid()));
create policy "profiles_update_self" on profiles for update using (id = auth.uid());
create policy "profiles_insert_self" on profiles for insert with check (id = auth.uid());

-- Clubs: members can read their club
create policy "clubs_read" on clubs for select using (is_club_member(id) or owner_id = auth.uid());
create policy "clubs_insert_owner" on clubs for insert with check (owner_id = auth.uid());
create policy "clubs_update_owner" on clubs for update using (owner_id = auth.uid());

-- Teams / announcements / events / players: readable by club members
create policy "teams_read" on teams for select using (is_club_member(club_id));
create policy "teams_write_staff" on teams for insert with check (is_club_member(club_id));

create policy "announcements_read" on announcements for select using (is_club_member(club_id));
create policy "announcements_write" on announcements for insert with check (is_club_member(club_id) and author_id = auth.uid());
create policy "announcements_update" on announcements for update using (author_id = auth.uid());

create policy "events_read" on events for select using (is_club_member(club_id));
create policy "events_write" on events for insert with check (is_club_member(club_id) and created_by = auth.uid());
create policy "events_update" on events for update using (created_by = auth.uid());

create policy "players_read" on players for select using (
  exists (select 1 from teams t where t.id = players.team_id and is_club_member(t.club_id))
);

create policy "evaluations_read" on evaluations for select using (
  exists (select 1 from players pl join teams t on t.id = pl.team_id where pl.id = evaluations.player_id and is_club_member(t.club_id))
);
create policy "evaluations_write" on evaluations for insert with check (coach_id = auth.uid());

create policy "dev_plans_read" on development_plans for select using (
  exists (select 1 from players pl join teams t on t.id = pl.team_id where pl.id = development_plans.player_id and is_club_member(t.club_id))
);

create policy "homework_read" on homework_items for select using (
  exists (select 1 from players pl join teams t on t.id = pl.team_id where pl.id = homework_items.player_id and is_club_member(t.club_id))
);
create policy "homework_update_complete" on homework_items for update using (
  exists (select 1 from players pl where pl.id = homework_items.player_id and pl.parent_id = auth.uid())
);

create policy "messages_read" on messages for select using (
  exists (select 1 from conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.profile_id = auth.uid())
);
create policy "messages_write" on messages for insert with check (sender_id = auth.uid());

create policy "conv_participants_read" on conversation_participants for select using (profile_id = auth.uid());
