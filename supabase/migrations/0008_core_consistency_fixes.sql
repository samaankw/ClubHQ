-- =========================================================
-- ClubHQ core consistency fixes
-- Fixes profile RLS recursion, auth profile creation, messaging inbox,
-- and team conversation membership synchronization.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Safe helpers that do not recurse through profiles RLS.
-- ---------------------------------------------------------
create or replace function current_user_club()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select club_id from profiles where id = auth.uid();
$$;

create or replace function is_club_member(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = auth.uid() and p.club_id = target_club
  );
$$;

create or replace function is_club_staff(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.club_id = target_club
      and p.role in ('coach', 'director')
  );
$$;

revoke all on function current_user_club() from public;
grant execute on function current_user_club() to authenticated;

-- Replace the recursive profiles policy.
drop policy if exists "profiles_self" on profiles;
create policy "profiles_self" on profiles for select using (
  id = auth.uid()
  or (club_id is not null and club_id = current_user_club())
);

-- ---------------------------------------------------------
-- 2. Create profiles server-side when auth.users is created.
--    This works whether email confirmation is enabled or disabled.
--    Role metadata is intentionally clamped to coach/parent so clients
--    cannot self-promote to director by calling signUp directly.
-- ---------------------------------------------------------
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'parent');

  if requested_role not in ('coach', 'parent') then
    requested_role := 'parent';
  end if;

  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'ClubHQ Member'),
    requested_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------
-- 3. Team conversations: authorize correctly and synchronize members
--    every time the RPC runs, rather than only on first creation.
-- ---------------------------------------------------------
create or replace function start_team_conversation(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_club uuid;
  caller_role text;
  team_club uuid;
  convo_id uuid;
  caller_is_team_member boolean;
begin
  if caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select club_id, role into caller_club, caller_role
  from profiles
  where id = caller_id;

  select club_id into team_club
  from teams
  where id = p_team_id;

  if team_club is null or caller_club is null or team_club is distinct from caller_club then
    raise exception 'That team is not part of your club.';
  end if;

  select (
    caller_role = 'director'
    or exists (
      select 1 from team_coaches tc
      where tc.team_id = p_team_id and tc.coach_id = caller_id
    )
    or exists (
      select 1 from players pl
      where pl.team_id = p_team_id and pl.parent_id = caller_id
    )
  ) into caller_is_team_member;

  if not caller_is_team_member then
    raise exception 'You are not a member of that team.';
  end if;

  select id into convo_id
  from conversations
  where team_id = p_team_id and type = 'team_group'
  order by created_at asc
  limit 1;

  if convo_id is null then
    insert into conversations (club_id, team_id, type)
    values (caller_club, p_team_id, 'team_group')
    returning id into convo_id;
  end if;

  -- Add everyone who currently belongs in the team conversation.
  insert into conversation_participants (conversation_id, profile_id)
  select distinct convo_id, member_id
  from (
    select coach_id as member_id
    from team_coaches
    where team_id = p_team_id

    union

    select parent_id as member_id
    from players
    where team_id = p_team_id and parent_id is not null

    union

    select caller_id as member_id
    where caller_role = 'director'
  ) desired
  where member_id is not null
  on conflict do nothing;

  -- Remove stale participants who are no longer team coaches/parents.
  -- Directors are retained because they can legitimately oversee the club.
  delete from conversation_participants cp
  where cp.conversation_id = convo_id
    and not exists (
      select 1
      from profiles p
      where p.id = cp.profile_id
        and p.club_id = caller_club
        and p.role = 'director'
    )
    and not exists (
      select 1 from team_coaches tc
      where tc.team_id = p_team_id and tc.coach_id = cp.profile_id
    )
    and not exists (
      select 1 from players pl
      where pl.team_id = p_team_id and pl.parent_id = cp.profile_id
    );

  return convo_id;
end;
$$;

grant execute on function start_team_conversation(uuid) to authenticated;

-- ---------------------------------------------------------
-- 4. One secure inbox RPC replaces client-side participant lookups and
--    N+1 queries. Because it is SECURITY DEFINER, it can resolve the other
--    direct-message participant while still exposing only conversations
--    the caller actually belongs to.
-- ---------------------------------------------------------
create or replace function get_conversation_inbox()
returns table (
  id uuid,
  type text,
  team_id uuid,
  team_name text,
  last_message text,
  last_message_at timestamptz,
  other_participant_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.type,
    c.team_id,
    t.name as team_name,
    lm.body as last_message,
    lm.created_at as last_message_at,
    case when c.type = 'direct' then other_profile.full_name else null end as other_participant_name
  from conversations c
  join conversation_participants mine
    on mine.conversation_id = c.id
   and mine.profile_id = auth.uid()
  left join teams t on t.id = c.team_id
  left join lateral (
    select m.body, m.created_at
    from messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select p.full_name
    from conversation_participants cp
    join profiles p on p.id = cp.profile_id
    where cp.conversation_id = c.id
      and cp.profile_id <> auth.uid()
    order by p.full_name
    limit 1
  ) other_profile on c.type = 'direct'
  order by lm.created_at desc nulls last, c.created_at desc;
$$;

revoke all on function get_conversation_inbox() from public;
grant execute on function get_conversation_inbox() to authenticated;
