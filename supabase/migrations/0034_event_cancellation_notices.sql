-- Cancellation notices.
--
-- 0033 covered sessions that move. Deleting one still sent nothing at all,
-- which is the worse gap: a parent who misses a time change shows up an hour
-- early, a parent who misses a cancellation drives to an empty field.
--
-- A correction to the note left in 0033: `source_event_id ... on delete set
-- null` does NOT by itself make cancellation notices possible. It stops a
-- notice from being erased when its event goes away, but the reference nulls
-- itself the moment the event is deleted, so a cancellation notice can never
-- point at what it's announcing. The provenance has to be denormalized into
-- columns no foreign key will clear — hence the arrays below.

-- ---------- Category ----------

-- 'holiday' is the closest existing category ("Holiday / No Training") but
-- means something different: a planned break, not a session pulled after
-- families already planned around it.
alter table announcements
  drop constraint if exists announcements_category_check;

alter table announcements
  add constraint announcements_category_check
  check (category in (
    'schedule','weather','location','availability','clinic','camp',
    'training_focus','challenge','what_to_bring','holiday','cancellation','general'
  ));

-- ---------- Provenance that survives the delete ----------

alter table announcements
  -- Which sessions this notice covers. Denormalized on purpose: these ids
  -- reference rows that no longer exist, so this cannot be a foreign key.
  -- Also what the client matches on to find the notice it just caused, and
  -- what a future "restore cancelled session" would read.
  add column if not exists source_cancelled_event_ids uuid[],
  -- Their start times, kept alongside so the body can be re-rendered from
  -- scratch each time another session folds into an existing notice. Without
  -- this the trigger would have to parse its own prose back out.
  add column if not exists source_cancelled_starts_at timestamptz[],
  -- The recurring series a cancellation belongs to, and the key later
  -- cancellations fold against.
  add column if not exists source_series_id uuid;

create index if not exists announcements_source_cancelled_events_idx
  on announcements using gin (source_cancelled_event_ids)
  where source_cancelled_event_ids is not null;

-- ---------- Notice text ----------

create or replace function build_event_cancellation_notice(
  p_event_title text,
  p_starts_at timestamptz[],
  p_timezone text
) returns table (title text, body text)
language plpgsql
immutable
as $$
declare
  -- How many sessions to spell out before collapsing the rest into a count.
  -- A coach ending a 20-week block shouldn't produce a card nobody scrolls.
  k_max_listed constant int := 8;
  v_sorted timestamptz[];
  v_count int;
  v_lines text[] := '{}';
  v_ts timestamptz;
  v_i int := 0;
begin
  select array_agg(s order by s) into v_sorted from unnest(p_starts_at) s;
  v_count := coalesce(array_length(v_sorted, 1), 0);

  if v_count = 0 then
    return query select 'Cancelled: ' || p_event_title, ''::text;
    return;
  end if;

  if v_count = 1 then
    return query select
      'Cancelled: ' || p_event_title,
      'Was: ' || to_char(v_sorted[1] at time zone p_timezone,
                         'FMDay, FMMon FMDD · FMHH12:MI AM');
    return;
  end if;

  foreach v_ts in array v_sorted loop
    v_i := v_i + 1;
    exit when v_i > k_max_listed;
    v_lines := v_lines || to_char(v_ts at time zone p_timezone,
                                  'FMDay, FMMon FMDD · FMHH12:MI AM');
  end loop;

  if v_count > k_max_listed then
    v_lines := v_lines || format('…and %s more', v_count - k_max_listed);
  end if;

  return query select
    format('%s sessions cancelled: %s', v_count, p_event_title),
    array_to_string(v_lines, E'\n');
end;
$$;

-- ---------- The trigger ----------

create or replace function announce_event_cancellation() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_author uuid;
  v_target_type text;
  v_team_id uuid;
  v_existing_id uuid;
  v_event_ids uuid[];
  v_starts_at timestamptz[];
  v_notice record;
  v_announcement_id uuid;
begin
  -- Same GUC as 0033. One opt-out concept covering every automatic notice,
  -- rather than a second flag a caller could set inconsistently.
  if coalesce(current_setting('clubhq.suppress_change_notice', true), 'off') = 'on' then
    return old;
  end if;

  -- Depth 1 is a direct `delete from events`. Anything deeper is a cascade —
  -- deleting a club, a team, or a coach's profile. Tearing down a team should
  -- not fire a cancellation notice per session, and it would fail anyway:
  -- announcements.team_id points at the team being removed.
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  -- Deleting last month's session is cleaning up records, not news.
  if old.starts_at <= now() then
    return old;
  end if;

  -- Unlike 0033, a null auth.uid() is a hard skip rather than a fallback to
  -- created_by. An edit arriving from service-role tooling is still a real
  -- schedule change worth announcing; a *deletion* from service-role tooling
  -- is far more likely to be a backfill, a data repair, or account teardown,
  -- and "your sessions are cancelled" is not a message to send on a guess.
  v_author := auth.uid();
  if v_author is null then
    return old;
  end if;

  select timezone into v_tz from clubs where id = old.club_id;
  if not found then
    -- The club itself is going away; nobody is left to notify.
    return old;
  end if;
  v_tz := coalesce(v_tz, 'America/New_York');

  -- Mirrors events_read, exactly as announce_event_change does. This runs
  -- BEFORE DELETE specifically so event_players is still readable — the FK
  -- cascade clears it before any AFTER trigger could look. That's the mirror
  -- image of why the change trigger has to be DEFERRED: on update the child
  -- rows land too late, on delete they vanish too early.
  if exists (select 1 from event_players where event_id = old.id) then
    v_target_type := 'players';
    v_team_id := null; -- announcements_target_type_team_id_check
  elsif old.team_id is not null then
    v_target_type := 'team';
    v_team_id := old.team_id;
  else
    v_target_type := 'everyone';
    v_team_id := null;
  end if;

  -- A pending "New time" notice for a session that no longer exists is worse
  -- than no notice: it tells a parent to show up. Retract it, but only inside
  -- the fold window — an older change notice is history a parent may already
  -- have read and acted on, and the cancellation card sits above it anyway.
  delete from announcements
  where source_event_id = old.id
    and auto_generated
    and category in ('schedule', 'location')
    and created_at > now() - event_change_notice_window();

  -- Fold sibling sessions from the same series into one card. Cancelling the
  -- rest of a 12-week block is one decision and should read as one.
  -- Targeting must match exactly: a series whose sessions were aimed at
  -- different people is not one announcement, and widening to cover both
  -- would notify families about sessions they were never on.
  if old.series_id is not null then
    select id, source_cancelled_event_ids, source_cancelled_starts_at
      into v_existing_id, v_event_ids, v_starts_at
    from announcements
    where source_series_id = old.series_id
      and auto_generated
      and category = 'cancellation'
      and target_type = v_target_type
      and team_id is not distinct from v_team_id
      and created_at > now() - event_change_notice_window()
    order by created_at desc
    limit 1;
  end if;

  if v_existing_id is null then
    v_event_ids := array[old.id];
    v_starts_at := array[old.starts_at];
  else
    -- Guard against re-processing the same event id, so a retry can't inflate
    -- the count to "2 sessions cancelled" for one session.
    if old.id = any(v_event_ids) then
      return old;
    end if;
    v_event_ids := v_event_ids || old.id;
    v_starts_at := v_starts_at || old.starts_at;
  end if;

  select * into v_notice from build_event_cancellation_notice(
    old.title, v_starts_at, v_tz
  );

  if v_existing_id is not null then
    update announcements set
      title = v_notice.title,
      body = v_notice.body,
      source_cancelled_event_ids = v_event_ids,
      source_cancelled_starts_at = v_starts_at,
      -- Re-sorts to the top of the feed. announcement_reads is keyed by id
      -- and untouched, so it stays unread for anyone who hadn't opened it.
      created_at = now()
    where id = v_existing_id;
    v_announcement_id := v_existing_id;
  else
    insert into announcements (
      club_id, team_id, author_id, title, body, category, target_type,
      auto_generated, source_series_id,
      source_cancelled_event_ids, source_cancelled_starts_at
    ) values (
      old.club_id, v_team_id, v_author, v_notice.title, v_notice.body,
      'cancellation', v_target_type, true, old.series_id,
      v_event_ids, v_starts_at
    )
    returning id into v_announcement_id;
  end if;

  if v_target_type = 'players' then
    insert into announcement_player_targets (announcement_id, player_id)
    select v_announcement_id, player_id from event_players where event_id = old.id
    on conflict do nothing;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_announce_event_cancellation on events;

-- BEFORE, not AFTER: see the event_players note in the function body.
create trigger trg_announce_event_cancellation
  before delete on events
  for each row
  execute function announce_event_cancellation();

-- ---------- Callable deletes ----------

-- Both of these are SECURITY INVOKER on purpose. The events_delete policy
-- from 0019 already encodes who may delete what; running as the caller lets
-- RLS do that job instead of copying the rule into a definer function where
-- the two can drift apart. The trigger is the only part that needs elevated
-- rights, and it has them.
--
-- They exist so the client can (a) set the suppress GUC transaction-locally,
-- which a plain PostgREST .delete() cannot do, and (b) get back the ids of
-- the notices it just caused, so it can fire the push without guessing.

create or replace function delete_event(
  p_event_id uuid,
  p_notify boolean default true
) returns uuid[]
language plpgsql
as $$
declare
  v_deleted uuid[];
  v_notices uuid[];
begin
  perform set_config('clubhq.suppress_change_notice',
                     case when p_notify then 'off' else 'on' end, true);

  with gone as (
    delete from events where id = p_event_id returning id
  )
  select array_agg(id) into v_deleted from gone;

  if v_deleted is null then
    -- RLS filtered it out, or it was already gone. Same signal either way,
    -- and the client already distinguishes them by re-reading.
    raise exception 'Event not found or not yours to delete'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(id), '{}') into v_notices
  from announcements
  where auto_generated
    and category = 'cancellation'
    and source_cancelled_event_ids && v_deleted;

  return v_notices;
end;
$$;

create or replace function cancel_event_series(
  p_series_id uuid,
  p_from timestamptz,
  p_notify boolean default true
) returns uuid[]
language plpgsql
as $$
declare
  v_deleted uuid[];
  v_notices uuid[];
begin
  perform set_config('clubhq.suppress_change_notice',
                     case when p_notify then 'off' else 'on' end, true);

  -- >= p_from mirrors the existing client query: this session and every later
  -- one, past sessions untouched.
  with gone as (
    delete from events
    where series_id = p_series_id and starts_at >= p_from
    returning id
  )
  select array_agg(id) into v_deleted from gone;

  if v_deleted is null then
    raise exception 'No sessions found, or not yours to delete'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(id), '{}') into v_notices
  from announcements
  where auto_generated
    and category = 'cancellation'
    and source_cancelled_event_ids && v_deleted;

  return v_notices;
end;
$$;

grant execute on function build_event_cancellation_notice(text, timestamptz[], text) to authenticated;
grant execute on function delete_event(uuid, boolean) to authenticated;
grant execute on function cancel_event_series(uuid, timestamptz, boolean) to authenticated;
