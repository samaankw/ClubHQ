-- Same root cause as the team/event/announcement labeling fix (every team's
-- `name` is literally "Williams Soccer Clinic" — age_group is what actually
-- distinguishes one from another): the messages inbox showed every team
-- group chat under the same identical name. Return age_group alongside
-- team_name so the client can prefer it, same as teamLabel() does elsewhere.
-- RETURNS TABLE shape is changing, so this has to be dropped and recreated
-- rather than CREATE OR REPLACE'd (Postgres rejects a return-type change).
drop function if exists get_conversation_inbox();

create function get_conversation_inbox()
returns table (
  id uuid,
  type text,
  team_id uuid,
  team_name text,
  team_age_group text,
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
    t.age_group as team_age_group,
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
