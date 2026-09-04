-- =========================================================
-- Privacy rights + durable consent history
--
-- F8 fix: consent evidence must not disappear just because the adult account
-- or player record it referred to is later deleted. The live foreign keys are
-- therefore nullable/SET NULL, while stable subject UUIDs remain as a
-- pseudonymous audit reference. No name, email, or other copied profile fields
-- are added to the retained ledger.
-- =========================================================

alter table consent_records
  add column if not exists subject_user_id uuid,
  add column if not exists subject_player_id uuid,
  add column if not exists status text not null default 'active',
  add column if not exists withdrawn_at timestamptz;

update consent_records
set subject_user_id = coalesce(subject_user_id, user_id),
    subject_player_id = coalesce(subject_player_id, player_id)
where subject_user_id is null
   or (subject_player_id is null and player_id is not null);

alter table consent_records
  alter column subject_user_id set not null;

alter table consent_records
  drop constraint if exists consent_records_status_check;
alter table consent_records
  add constraint consent_records_status_check
  check (
    status in ('active', 'withdrawn')
    and ((status = 'active' and withdrawn_at is null) or status = 'withdrawn')
  );

alter table consent_records
  drop constraint if exists consent_records_user_id_fkey;
alter table consent_records
  alter column user_id drop not null;
alter table consent_records
  add constraint consent_records_user_id_fkey
  foreign key (user_id) references profiles(id) on delete set null;

alter table consent_records
  drop constraint if exists consent_records_player_id_fkey;
alter table consent_records
  add constraint consent_records_player_id_fkey
  foreign key (player_id) references players(id) on delete set null;

create or replace function set_consent_subject_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.subject_user_id := coalesce(new.subject_user_id, new.user_id);
  new.subject_player_id := coalesce(new.subject_player_id, new.player_id);
  if new.subject_user_id is null then
    raise exception 'A consent record requires a subject user.';
  end if;
  return new;
end;
$$;

drop trigger if exists consent_records_subject_refs on consent_records;
create trigger consent_records_subject_refs
before insert or update of user_id, player_id, subject_user_id, subject_player_id
on consent_records
for each row execute function set_consent_subject_refs();

-- A live user can read their complete consent history by stable subject UUID.
-- Directors retain their prior same-club visibility only while the subject has
-- a live profile. Once an account is deleted, retained consent evidence is not
-- exposed back through ordinary app RLS.
drop policy if exists "consent_records_read_self" on consent_records;
create policy "consent_records_read_self" on consent_records for select using (
  subject_user_id = auth.uid()
  or exists (
    select 1 from profiles p
    where p.id = consent_records.user_id
      and p.club_id = (select club_id from profiles where id = auth.uid())
      and (select role from profiles where id = auth.uid()) = 'director'
  )
);

comment on table consent_records is
  'Append-oriented consent evidence. Live profile/player FKs are nulled on deletion; stable subject UUIDs remain for documented consent/withdrawal evidence and must be purged under the approved retention/legal-hold schedule.';
comment on column consent_records.subject_user_id is
  'Stable pseudonymous user UUID retained when the live profile is deleted; do not join this to copied name/email fields.';
comment on column consent_records.subject_player_id is
  'Stable pseudonymous player UUID retained when the live player record is deleted.';

-- A parent who withdraws consent immediately loses the live parent link. They
-- may still exercise deletion while that player remains unlinked, using the
-- retained withdrawal evidence. If another parent is later linked, the former
-- parent no longer has deletion authority.
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
  is_withdrawn_parent boolean;
  is_director_of_club boolean;
begin
  select role into caller_role from profiles where id = caller_id;

  select exists (
    select 1 from players
    where id = p_player_id and parent_id = caller_id
  ) into is_parent;

  select exists (
    select 1
    from players pl
    where pl.id = p_player_id
      and pl.parent_id is null
      and exists (
        select 1 from consent_records cr
        where cr.subject_user_id = caller_id
          and cr.subject_player_id = p_player_id
          and cr.consent_type = 'parental_data_consent'
          and cr.status = 'withdrawn'
      )
  ) into is_withdrawn_parent;

  select exists (
    select 1 from players pl
    join teams t on t.id = pl.team_id
    where pl.id = p_player_id
      and t.club_id = (select club_id from profiles where id = caller_id)
      and caller_role = 'director'
  ) into is_director_of_club;

  if not (is_parent or is_withdrawn_parent or is_director_of_club) then
    raise exception 'You are not authorized to delete this player''s data.';
  end if;

  delete from players where id = p_player_id;
end;
$$;

grant execute on function delete_player_data(uuid) to authenticated;
