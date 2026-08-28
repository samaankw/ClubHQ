-- The drills table's skill check constraint predates Ball Control as a
-- skill — without this, saving a drill tagged "Ball Control" from the app
-- would fail outright with a check-constraint violation.
alter table drills drop constraint if exists drills_skill_check;
alter table drills add constraint drills_skill_check check (skill in (
  'first_touch','ball_control','passing','dribbling','weak_foot','finishing',
  'decision_making','scanning','speed','positioning'
));
