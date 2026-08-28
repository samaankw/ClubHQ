-- Lets each coach/director add a title and short bio for the "Meet the
-- Coaches" section on the home screen. Self-edited (existing
-- profiles_update_self / profiles_self RLS policies already cover this —
-- no new policies needed since these are just two more columns on profiles).
alter table profiles add column if not exists coach_title text;
alter table profiles add column if not exists coach_bio text;
