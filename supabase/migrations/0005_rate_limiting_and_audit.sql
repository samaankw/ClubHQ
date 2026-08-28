-- =========================================================
-- Rate limiting + audit logging
-- =========================================================

-- ---------------------------------------------------------
-- Rate limiting: a simple sliding-window counter, checked by edge
-- functions BEFORE they call Anthropic. This is what stops a hammered
-- or compromised account from running up your AI bill.
-- ---------------------------------------------------------
create table if not exists rate_limit_hits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  function_name text not null,
  created_at timestamptz default now()
);

create index if not exists rate_limit_hits_lookup on rate_limit_hits (user_id, function_name, created_at);

-- Called by edge functions with the service role, so it takes user_id as a
-- parameter rather than relying on auth.uid() (which isn't set in that context).
-- Returns true and records the call if under the limit; returns false (and
-- records nothing) if the caller is over it — so a blocked attempt doesn't
-- itself count against them once they're allowed to try again.
create or replace function check_rate_limit(p_user_id uuid, p_function_name text, p_max_calls int, p_window_minutes int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hit_count int;
begin
  -- Opportunistic cleanup so this table doesn't grow unbounded
  delete from rate_limit_hits where created_at < now() - interval '2 days';

  select count(*) into hit_count from rate_limit_hits
    where user_id = p_user_id
      and function_name = p_function_name
      and created_at > now() - (p_window_minutes || ' minutes')::interval;

  if hit_count >= p_max_calls then
    return false;
  end if;

  insert into rate_limit_hits (user_id, function_name) values (p_user_id, p_function_name);
  return true;
end;
$$;

grant execute on function check_rate_limit(uuid, text, int, int) to service_role;

-- ---------------------------------------------------------
-- Audit log: who changed a role or created/joined a club, and when.
-- Written to by the SECURITY DEFINER functions themselves (create_club,
-- join_club, set_member_role), since those are the only paths that can
-- change role/club_id at all after the 0004 hardening pass.
-- ---------------------------------------------------------
create table if not exists role_change_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid not null,              -- who performed the change
  target_id uuid not null,             -- whose role/club changed
  club_id uuid,
  action text not null,                -- 'club_created' | 'club_joined' | 'role_changed'
  old_role text,
  new_role text,
  created_at timestamptz default now()
);

alter table role_change_log enable row level security;

-- Directors can see their own club's audit trail; nobody else can.
create policy "role_change_log_read" on role_change_log for select using (
  club_id is not null and exists (
    select 1 from profiles p where p.id = auth.uid() and p.club_id = role_change_log.club_id and p.role = 'director'
  )
);

-- Re-create the three functions with logging added.
create or replace function create_club(club_name text)
returns clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  new_club clubs;
  caller_club uuid;
begin
  select club_id into caller_club from profiles where id = auth.uid();
  if caller_club is not null then
    raise exception 'You already belong to a club.';
  end if;

  insert into clubs (name, owner_id) values (club_name, auth.uid())
  returning * into new_club;

  update profiles set role = 'director', club_id = new_club.id where id = auth.uid();

  insert into role_change_log (actor_id, target_id, club_id, action, old_role, new_role)
  values (auth.uid(), auth.uid(), new_club.id, 'club_created', null, 'director');

  return new_club;
end;
$$;

create or replace function join_club(code text)
returns clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club clubs;
  caller_club uuid;
  caller_role text;
begin
  select club_id, role into caller_club, caller_role from profiles where id = auth.uid();
  if caller_club is not null then
    raise exception 'You already belong to a club.';
  end if;

  select * into target_club from clubs where join_code = code;
  if target_club.id is null then
    raise exception 'Invalid invite code.';
  end if;

  update profiles set club_id = target_club.id where id = auth.uid();

  insert into role_change_log (actor_id, target_id, club_id, action, old_role, new_role)
  values (auth.uid(), auth.uid(), target_club.id, 'club_joined', caller_role, caller_role);

  return target_club;
end;
$$;

create or replace function set_member_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_club uuid;
  target_club uuid;
  target_old_role text;
begin
  select role, club_id into caller_role, caller_club from profiles where id = auth.uid();
  if caller_role is distinct from 'director' then
    raise exception 'Only directors can change member roles.';
  end if;
  if new_role not in ('coach', 'parent', 'director') then
    raise exception 'Invalid role.';
  end if;

  select club_id, role into target_club, target_old_role from profiles where id = target_user_id;
  if target_club is distinct from caller_club then
    raise exception 'That person is not in your club.';
  end if;

  update profiles set role = new_role where id = target_user_id;

  insert into role_change_log (actor_id, target_id, club_id, action, old_role, new_role)
  values (auth.uid(), target_user_id, caller_club, 'role_changed', target_old_role, new_role);
end;
$$;
