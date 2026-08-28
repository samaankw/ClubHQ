-- Parents/coaches have no way to find an old message ("what was that link
-- coach posted?") short of scrolling every conversation by hand. This adds
-- a server-side search across every conversation the caller participates
-- in, mirroring get_conversation_inbox's pattern for resolving a
-- conversation's display name (team label vs. other participant).
create or replace function search_messages(p_query text)
returns table (
  message_id uuid,
  conversation_id uuid,
  body text,
  created_at timestamptz,
  sender_name text,
  conversation_type text,
  team_name text,
  team_age_group text,
  other_participant_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id as message_id,
    m.conversation_id,
    m.body,
    m.created_at,
    sender.full_name as sender_name,
    c.type as conversation_type,
    t.name as team_name,
    t.age_group as team_age_group,
    case when c.type = 'direct' then other_profile.full_name else null end as other_participant_name
  from messages m
  join conversations c on c.id = m.conversation_id
  join conversation_participants mine
    on mine.conversation_id = c.id
   and mine.profile_id = auth.uid()
  join profiles sender on sender.id = m.sender_id
  left join teams t on t.id = c.team_id
  left join lateral (
    select p.full_name
    from conversation_participants cp
    join profiles p on p.id = cp.profile_id
    where cp.conversation_id = c.id
      and cp.profile_id <> auth.uid()
    order by p.full_name
    limit 1
  ) other_profile on c.type = 'direct'
  where p_query is not null
    and length(trim(p_query)) > 0
    and m.body ilike '%' || p_query || '%'
  order by m.created_at desc
  limit 50;
$$;

revoke all on function search_messages(text) from public;
grant execute on function search_messages(text) to authenticated;
