-- Phase 6b left a real gap: create_club had no way to set org_type at all,
-- so every club was permanently stuck at the column default (small_club) --
-- nothing in lib/vocab.ts's adaptive wording was ever reachable by a real
-- user. Lets a director choose it at creation, and change it afterward.

-- create or replace with a different argument count creates a NEW overload
-- rather than replacing the existing one (0024 already hit this exact issue
-- with create_targeted_event) -- drop the old 1-arg signature explicitly so
-- there's exactly one create_club, not two.
drop function if exists create_club(text);

create or replace function create_club(club_name text, p_org_type text default 'small_club')
returns clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  new_club clubs;
  caller_club uuid;
begin
  if p_org_type not in ('private_trainer', 'academy', 'small_club', 'large_club') then
    raise exception 'Invalid org_type.';
  end if;

  select club_id into caller_club from profiles where id = auth.uid();
  if caller_club is not null then
    raise exception 'You already belong to a club.';
  end if;

  insert into clubs (name, owner_id, org_type) values (club_name, auth.uid(), p_org_type)
  returning * into new_club;

  update profiles set role = 'director', club_id = new_club.id where id = auth.uid();

  insert into role_change_log (actor_id, target_id, club_id, action, old_role, new_role)
  values (auth.uid(), auth.uid(), new_club.id, 'club_created', null, 'director');

  return new_club;
end;
$$;

grant execute on function create_club(text, text) to authenticated;

-- A director can now change their own club's org_type after the fact too
-- (e.g. a private trainer growing into an academy), not just at creation --
-- same director-editable policy 0041 already set up for name/crest_url/bio.
revoke update on clubs from authenticated;
grant update (name, crest_url, bio, org_type) on clubs to authenticated;
