-- =========================================================
-- Fixes from manual security review
-- =========================================================

-- ---------------------------------------------------------
-- 1. messages_write didn't check the sender was actually a participant
--    in the conversation — only that sender_id matched the caller. Anyone
--    with a conversation_id could post into a thread they're not part of.
-- ---------------------------------------------------------
drop policy if exists "messages_write" on messages;
create policy "messages_write" on messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from conversation_participants cp
    where cp.conversation_id = messages.conversation_id and cp.profile_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- 2. `conversations` had NO read or insert policy at all, which — with RLS
--    on — meant every operation was denied by default. That's safe, but it
--    also meant the messaging feature couldn't actually function as built
--    (the conversation list would always be empty, and direct client-side
--    inserts into conversations/conversation_participants would fail).
--
--    Rather than write an RLS policy that lets a client insert OTHER
--    people as participants (hard to do safely — you'd need to trust the
--    client's list of who belongs on a team), conversation creation moves
--    to two SECURITY DEFINER functions that verify everything server-side.
-- ---------------------------------------------------------
create policy "conversations_read" on conversations for select using (
  exists (select 1 from conversation_participants cp where cp.conversation_id = conversations.id and cp.profile_id = auth.uid())
);

-- Starts (or reuses) a team group chat and populates it with that team's
-- coaches + the parents of its roster. Verifies the team actually belongs
-- to the caller's own club before doing anything.
create or replace function start_team_conversation(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_club uuid;
  team_club uuid;
  convo_id uuid;
begin
  select club_id into caller_club from profiles where id = auth.uid();
  select club_id into team_club from teams where id = p_team_id;

  if team_club is null or team_club is distinct from caller_club then
    raise exception 'That team is not part of your club.';
  end if;

  select id into convo_id from conversations where team_id = p_team_id and type = 'team_group';

  if convo_id is null then
    insert into conversations (club_id, team_id, type) values (caller_club, p_team_id, 'team_group')
    returning id into convo_id;

    insert into conversation_participants (conversation_id, profile_id)
    select distinct convo_id, member_id from (
      select coach_id as member_id from team_coaches where team_id = p_team_id
      union
      select parent_id as member_id from players where team_id = p_team_id and parent_id is not null
      union
      select auth.uid() as member_id
    ) members
    on conflict do nothing;
  end if;

  return convo_id;
end;
$$;

-- Starts (or reuses) a direct message thread with another member of the
-- caller's own club. Verifies the other person is actually in that club.
create or replace function start_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_club uuid;
  other_club uuid;
  convo_id uuid;
begin
  select club_id into caller_club from profiles where id = auth.uid();
  select club_id into other_club from profiles where id = p_other_user_id;

  if other_club is null or other_club is distinct from caller_club then
    raise exception 'That person is not in your club.';
  end if;

  select cp1.conversation_id into convo_id
  from conversation_participants cp1
  join conversation_participants cp2 on cp2.conversation_id = cp1.conversation_id
  join conversations c on c.id = cp1.conversation_id
  where c.type = 'direct' and cp1.profile_id = auth.uid() and cp2.profile_id = p_other_user_id
  limit 1;

  if convo_id is null then
    insert into conversations (club_id, type) values (caller_club, 'direct') returning id into convo_id;
    insert into conversation_participants (conversation_id, profile_id) values (convo_id, auth.uid()), (convo_id, p_other_user_id);
  end if;

  return convo_id;
end;
$$;

grant execute on function start_team_conversation(uuid) to authenticated;
grant execute on function start_direct_conversation(uuid) to authenticated;

-- ---------------------------------------------------------
-- 3. announcements/events UPDATE policies only checked author_id — with no
--    WITH CHECK restricting other columns, an author could repoint
--    club_id/team_id to a DIFFERENT club, injecting their content into
--    that club's feed. Lock updates to content columns only.
-- ---------------------------------------------------------
revoke update on announcements from authenticated;
grant update (title, body, pinned) on announcements to authenticated;

revoke update on events from authenticated;
grant update (title, location, starts_at, ends_at, notes, type) on events to authenticated;

-- ---------------------------------------------------------
-- 4. homework_items' "let a parent mark their kid's homework complete"
--    policy granted a full-row update — a parent could rewrite the
--    assigned drill's title/description, not just toggle completion.
-- ---------------------------------------------------------
revoke update on homework_items from authenticated;
grant update (completed, completed_at) on homework_items to authenticated;

-- ---------------------------------------------------------
-- 5. No validation on drill video URLs — restrict to http(s) so nothing
--    with an unexpected scheme ends up in front of Linking.openURL on a
--    parent's device.
-- ---------------------------------------------------------
alter table drills add constraint drills_video_url_scheme
  check (video_url is null or video_url ~* '^https?://');
