-- AI-governance audit (docs/ai-governance-audit.md, finding F7): none of the
-- three AI-calling edge functions (generate-development-plan, extract-voice-note,
-- director-copilot) left any record of who triggered an Anthropic call, with
-- what model, producing what output. rate_limit_hits (0005) only tracks
-- throttling counters and actively deletes rows after 2 days; role_change_log
-- (0005) is unrelated (role/club changes only). This table is the missing
-- record, written by the edge functions themselves via the service role.

create table if not exists ai_call_log (
  id uuid primary key default extensions.uuid_generate_v4(),
  club_id uuid references clubs(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  function_name text not null,
  model text not null,
  output_summary text,
  created_at timestamptz not null default now()
);

create index if not exists ai_call_log_club_id_idx on ai_call_log (club_id, created_at desc);

alter table ai_call_log enable row level security;

-- Directors can review their own club's AI-call history; nobody else can.
-- No insert/update/delete policy exists for any role, so those stay denied
-- by RLS regardless of the schema's default grants -- writes happen only
-- from edge functions via the service role, which bypasses RLS entirely.
-- Same access model as role_change_log (0005).
create policy "ai_call_log_read" on ai_call_log for select using (
  club_id is not null and exists (
    select 1 from profiles p
    where p.id = (select auth.uid()) and p.club_id = ai_call_log.club_id and p.role = 'director'
  )
);
