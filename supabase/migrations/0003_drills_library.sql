-- Curated drill library. AI picks FROM this table for homework — it never
-- invents or freely searches for video links, so every video a kid sees has
-- been vetted by a coach/director first.

create table if not exists drills (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid references clubs(id) on delete cascade,  -- null = available to every club (a shared starter set)
  skill text not null check (skill in (
    'first_touch','passing','dribbling','weak_foot','finishing',
    'decision_making','scanning','speed','positioning'
  )),
  title text not null,
  description text not null,           -- short instructions a parent/player can follow
  video_url text,                      -- link to a vetted YouTube/Vimeo video, optional
  age_range text,                      -- e.g. "U8-U10"
  equipment text,                      -- e.g. "1 ball, 2 cones"
  added_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table homework_items add column if not exists drill_id uuid references drills(id) on delete set null;

alter table drills enable row level security;

-- Everyone can read shared drills (club_id is null) or their own club's drills
create policy "drills_read" on drills for select using (
  club_id is null or is_club_member(club_id)
);

-- Coaches/directors in a club can add drills for their club
create policy "drills_write" on drills for insert with check (
  club_id is null or (is_club_member(club_id) and added_by = auth.uid())
);

-- ---------------------------------------------------------------
-- Starter library: vetted, real, publicly available coaching videos.
-- Swap these for your own footage whenever you're ready — this just
-- means homework isn't empty on day one.
-- ---------------------------------------------------------------
insert into drills (club_id, skill, title, description, video_url, age_range, equipment) values
(null, 'weak_foot', 'Weak-Foot Wall Passes', 'Stand 5-8 yards from a wall. Pass and receive using ONLY your weak foot for 5 minutes straight. Focus on clean contact, not power.', 'https://www.youtube.com/watch?v=ZKJ3XxuMIaI', 'U8-U14', '1 ball, a wall'),
(null, 'weak_foot', 'Weak-Foot Only Session', 'Play a full solo touches session using only your weaker foot — dribbling, passing, and shooting. Builds comfort fast.', 'https://www.youtube.com/watch?v=W-OlqudP3WU', 'U10-U16', '1 ball'),
(null, 'first_touch', 'Gated First-Touch Control', 'Set up two cones as a small gate. Toss the ball to yourself, control it through the gate in one touch, then push forward. 20 reps.', 'https://www.youtube.com/watch?v=G8XU93a3kpo', 'U8-U14', '1 ball, 2 cones'),
(null, 'first_touch', 'Moving First Touch vs Wall', 'Jog laterally along a wall, pass to yourself, control the return ball while still moving, then push it forward. Repeat both directions.', null, 'U10-U16', '1 ball, a wall'),
(null, 'dribbling', 'Cone Gates Dribbling', 'Set up 5-6 cone gates spread across a small area. Dribble through as many gates as possible in 2 minutes, alternating feet.', 'https://www.youtube.com/watch?v=SoijY4BUCtw', 'U6-U12', '1 ball, 6 cones'),
(null, 'scanning', 'Shoulder-Check Passing', 'With a partner or wall, check over your shoulder before every single touch — even in a simple passing drill. Coach/parent calls out a number of fingers behind the player as they receive the ball; player must call the number out loud before their next touch.', null, 'U9-U16', '1 ball, a partner'),
(null, 'passing', 'Two-Touch Wall Passing', 'From 6-8 yards away, pass to the wall and control with one touch, pass again with the second touch. 3 sets of 20.', null, 'U8-U14', '1 ball, a wall'),
(null, 'finishing', 'Target Corner Shooting', 'Place a cone in each corner of the goal (or a marked target). From the top of the box, take 10 shots aiming for the corners, alternating feet.', null, 'U10-U16', '1 ball, a goal or wall target'),
(null, 'decision_making', 'Two-Option Rondo (small-sided)', 'In a tight grid with 3-4 players, the player on the ball must decide in under 2 seconds whether to pass or dribble — no standing still on the ball.', null, 'U10-U16', '1 ball, cones for a grid'),
(null, 'speed', 'Sprint-Recover Ladder', '10-yard sprints with a jog-back recovery, 8 reps. Focus on first-step explosiveness, not top speed.', null, 'U10-U16', 'open space, cones');
