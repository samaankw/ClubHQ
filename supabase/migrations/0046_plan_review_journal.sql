-- =========================================================
-- An append-only journal of development-plan approval events.
--
-- "A coach approves every AI-generated report before a parent can see it" is
-- this product's strongest safety claim, and it is genuinely enforced: plans
-- are created as 'draft' and an RLS policy blocks parents from reading
-- anything that is not 'published'.
--
-- What was missing is history. review_development_plan() records the outcome
-- by overwriting reviewed_by / reviewed_at / published_at on the plan itself,
-- so only the most recent action survives. A plan that was published, pulled
-- back, and republished by someone else reads exactly like one that was
-- published once. That is enough to show the current state, but not enough to
-- demonstrate that the control actually operated -- which is the question
-- asked during a dispute or a procurement review, and the one moment the
-- answer cannot be reconstructed after the fact.
--
-- role_change_log (0005) already does this for role changes. This is the
-- same idea for report approvals.
-- =========================================================

create table if not exists plan_review_log (
  id uuid primary key default extensions.uuid_generate_v4(),
  -- SET NULL, not CASCADE: the journal outlives the plan it describes, but
  -- stops pointing at a record that no longer exists. Deleting a child's data
  -- must stay possible, so nothing here may block it.
  plan_id uuid references development_plans(id) on delete set null,
  club_id uuid references clubs(id) on delete cascade,
  -- Also SET NULL, and deliberately so: an adult deleting their account must
  -- not be blocked by this table. A foreign key with no ON DELETE behavior
  -- here would need a matching entry in delete-account's cleanup list, which
  -- is exactly the omission that made self-deletion fail for anyone who had
  -- marked a payment (see 0025 / the F10 fix). Postgres handles it instead.
  actor_id uuid references profiles(id) on delete set null,
  action text not null check (action in ('published', 'unpublished')),
  old_status text,
  new_status text not null,
  created_at timestamptz not null default now()
);

-- No player_id column on purpose. This journal records a staff approval
-- action, not anything about a child, so a right-to-erasure request has
-- nothing to remove here. Which child a row refers to is answerable by
-- joining development_plans for as long as that plan exists.

create index if not exists plan_review_log_club_idx on plan_review_log (club_id, created_at desc);
create index if not exists plan_review_log_plan_idx on plan_review_log (plan_id, created_at desc);

alter table plan_review_log enable row level security;

-- Directors can review their own club's approval history; nobody else can,
-- matching role_change_log's access model. There is deliberately no insert,
-- update or delete policy: rows are written only by review_development_plan()
-- below, which is SECURITY DEFINER, so the journal cannot be edited or
-- back-dated through the API by any client.
create policy "plan_review_log_read" on plan_review_log for select using (
  club_id is not null
  and exists (
    select 1 from profiles p
    where p.id = (select auth.uid()) and p.club_id = plan_review_log.club_id and p.role = 'director'
  )
);

-- Recreated to write a journal row alongside the existing update. The
-- authorization checks and the update itself are unchanged from 0040; the
-- previous status is now captured before the write so the journal can record
-- what actually changed.
create or replace function review_development_plan(p_plan_id uuid, p_publish boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_club uuid;
  plan_club uuid;
  plan_coach uuid;
  prev_status text;
  next_status text;
begin
  select role, club_id into caller_role, caller_club from profiles where id = caller_id;

  select pl.club_id, e.coach_id, dp.status
    into plan_club, plan_coach, prev_status
  from development_plans dp
  join players pl on pl.id = dp.player_id
  join evaluations e on e.id = dp.evaluation_id
  where dp.id = p_plan_id;

  if caller_club is null or plan_club is distinct from caller_club then raise exception 'Plan is not in your club.'; end if;
  if caller_role <> 'director' and plan_coach is distinct from caller_id then
    raise exception 'Only the evaluating coach or a director can review this plan.';
  end if;

  next_status := case when p_publish then 'published' else 'coach_reviewed' end;

  update development_plans
  set reviewed_by = caller_id,
      reviewed_at = now(),
      status = next_status,
      published_at = case when p_publish then now() else null end
  where id = p_plan_id;

  insert into plan_review_log (plan_id, club_id, actor_id, action, old_status, new_status)
  values (
    p_plan_id,
    plan_club,
    caller_id,
    case when p_publish then 'published' else 'unpublished' end,
    prev_status,
    next_status
  );
end;
$$;

grant execute on function review_development_plan(uuid, boolean) to authenticated;
