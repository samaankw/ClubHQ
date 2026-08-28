-- Adds Ball Control as a real evaluation skill (not just a drill category),
-- so it participates in overall-score averaging and the AI homework-matching
-- pipeline the same way the other 9 skills already do.
alter table evaluations add column if not exists ball_control int check (ball_control between 1 and 10);
