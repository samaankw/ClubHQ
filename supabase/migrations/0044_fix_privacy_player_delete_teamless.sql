-- =========================================================
-- Follow-up to 0043: preserve 0040's teamless-player support.
--
-- players.club_id became the authoritative tenancy column in 0040 and
-- team_id is intentionally optional for private trainers/academies. The
-- privacy-rights replacement of delete_player_data in 0043 retained the new
-- withdrawn-parent authorization but accidentally reintroduced a join through
-- teams for director authorization. Recreate the function using club_id
-- directly so teamless players remain manageable.
-- =========================================================

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
    where pl.id = p_player_id
      and pl.club_id = (select club_id from profiles where id = caller_id)
      and caller_role = 'director'
  ) into is_director_of_club;

  if not (is_parent or is_withdrawn_parent or is_director_of_club) then
    raise exception 'You are not authorized to delete this player''s data.';
  end if;

  delete from players where id = p_player_id;
end;
$$;

grant execute on function delete_player_data(uuid) to authenticated;
