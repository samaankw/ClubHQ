-- =========================================================
-- Legal/compliance plumbing: consent records + self-service
-- deletion of a child's data. This does not constitute legal
-- advice or a compliance determination — it's the technical
-- groundwork an attorney reviewing this app would expect to
-- already be in place.
-- =========================================================

create table if not exists consent_records (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  consent_type text not null check (consent_type in ('terms_and_privacy', 'parental_data_consent')),
  policy_version text not null default 'v1',
  consented_at timestamptz default now()
);

alter table consent_records enable row level security;

-- Users can record their own consent and read their own consent history.
-- Directors can view (not edit) their own club's consent records, since
-- they may need to demonstrate this to a club's own liability insurer
-- or governing body.
create policy "consent_records_insert_self" on consent_records for insert with check (user_id = auth.uid());
create policy "consent_records_read_self" on consent_records for select using (
  user_id = auth.uid()
  or exists (
    select 1 from profiles p
    where p.id = consent_records.user_id
      and p.club_id = (select club_id from profiles where id = auth.uid())
      and (select role from profiles where id = auth.uid()) = 'director'
  )
);

-- ---------------------------------------------------------
-- Self-service deletion of a child's data.
-- Callable by the linked parent, or a director of the player's club.
-- Deletes the player row; every dependent table (evaluations,
-- development_plans, homework_items, report_views) is already set up
-- with ON DELETE CASCADE, so this one delete cleans up everything.
-- ---------------------------------------------------------
create or replace function delete_player_data(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_id uuid := auth.uid();
  is_parent boolean;
  is_director_of_club boolean;
begin
  select role into caller_role from profiles where id = caller_id;

  select exists (
    select 1 from players where id = p_player_id and parent_id = caller_id
  ) into is_parent;

  select exists (
    select 1 from players pl
    join teams t on t.id = pl.team_id
    where pl.id = p_player_id and t.club_id = (select club_id from profiles where id = caller_id)
      and caller_role = 'director'
  ) into is_director_of_club;

  if not (is_parent or is_director_of_club) then
    raise exception 'You are not authorized to delete this player''s data.';
  end if;

  delete from players where id = p_player_id;
end;
$$;

grant execute on function delete_player_data(uuid) to authenticated;
