-- Auto-generated change notices.
--
-- Three of the eleven announcement categories (schedule, location, holiday)
-- exist so a coach can hand-write a description of an edit the app already
-- witnessed. That's duplicate work, and worse, it's skippable — the most
-- common way a parent ends up at the wrong field is a coach who moved the
-- session and forgot to post about it.
--
-- send-event-push already fires on edit (isUpdate: true), so parents with
-- notifications on already get pinged. What's missing is the durable record:
-- nothing in the app says what the time *used* to be, and anyone who missed
-- the push has no way to find out an edit happened at all. This adds that
-- record as a normal announcement, so it lands in the merged feed, respects
-- the same targeting, counts toward the unread badge, and is searchable
-- later.

-- ---------- Provenance columns ----------

alter table announcements
  -- Drives the "Automatic" chip on the card, and hides the edit pencil: a
  -- generated notice shouldn't be hand-editable, or the record stops
  -- matching the event it describes.
  add column if not exists auto_generated boolean not null default false,
  -- ON DELETE SET NULL, not CASCADE: deleting a session should not erase the
  -- history of notices sent about it. Also leaves room for a future
  -- cancellation notice, which would otherwise cascade itself away at birth.
  add column if not exists source_event_id uuid references events(id) on delete set null,
  -- The values as they stood *before the first edit in this burst*. Needed so
  -- that a coach who fixes the time and then fixes the location thirty
  -- seconds later produces one notice measured from the original state, not
  -- two notices where the second one's "was" is the first one's "now".
  add column if not exists source_prev_starts_at timestamptz,
  add column if not exists source_prev_location text;

create index if not exists announcements_source_event_id_idx
  on announcements (source_event_id, created_at desc)
  where source_event_id is not null;

-- ---------- Per-club timezone ----------

-- send-event-push has been hardcoding America/New_York with a "revisit if
-- ClubHQ ever supports clubs outside" comment. The trigger below has to
-- render wall-clock times too, and a trigger is a much worse place to leave
-- a hardcoded zone, so the column lands here. Default preserves today's
-- behavior for the existing Atlanta club.
alter table clubs
  add column if not exists timezone text not null default 'America/New_York';

-- ---------- Notice generation ----------

create or replace function build_event_change_notice(
  p_event_id uuid,
  p_prev_starts_at timestamptz,
  p_prev_location text,
  p_new_starts_at timestamptz,
  p_new_location text,
  p_event_title text,
  p_timezone text
) returns table (title text, body text, category text)
language plpgsql
immutable
as $$
declare
  v_time_changed boolean := p_prev_starts_at is distinct from p_new_starts_at;
  v_loc_changed boolean := coalesce(nullif(btrim(p_prev_location), ''), '')
                           is distinct from coalesce(nullif(btrim(p_new_location), ''), '');
  v_same_day boolean;
  v_lines text[] := '{}';
begin
  v_same_day := (p_prev_starts_at at time zone p_timezone)::date
              = (p_new_starts_at at time zone p_timezone)::date;

  if v_time_changed then
    if v_same_day then
      -- Same calendar day, so repeating the date on both sides is noise —
      -- lead with the day once, then just the clock times.
      v_lines := v_lines || format(
        'When: %s · %s → %s',
        to_char(p_new_starts_at at time zone p_timezone, 'FMDay, FMMon FMDD'),
        to_char(p_prev_starts_at at time zone p_timezone, 'FMHH12:MI AM'),
        to_char(p_new_starts_at at time zone p_timezone, 'FMHH12:MI AM')
      );
    else
      v_lines := v_lines || format(
        'When: %s → %s',
        to_char(p_prev_starts_at at time zone p_timezone, 'FMDay, FMMon FMDD "at" FMHH12:MI AM'),
        to_char(p_new_starts_at at time zone p_timezone, 'FMDay, FMMon FMDD "at" FMHH12:MI AM')
      );
    end if;
  end if;

  if v_loc_changed then
    v_lines := v_lines || format(
      'Where: %s → %s',
      coalesce(nullif(btrim(p_prev_location), ''), 'No location set'),
      coalesce(nullif(btrim(p_new_location), ''), 'No location set')
    );
  end if;

  return query select
    case
      when v_time_changed and v_loc_changed then 'Time and location changed: ' || p_event_title
      when v_time_changed then 'New time: ' || p_event_title
      else 'New location: ' || p_event_title
    end,
    array_to_string(v_lines, E'\n'),
    -- A time change outranks a location change when both happen at once: it
    -- affects whether a family can attend at all, not just where they drive.
    case when v_time_changed then 'schedule' else 'location' end;
end;
$$;

-- How long after an auto notice a further edit folds into it instead of
-- posting a second one.
create or replace function event_change_notice_window() returns interval
language sql immutable as $$ select interval '10 minutes' $$;

create or replace function announce_event_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_time_changed boolean;
  v_loc_changed boolean;
  v_tz text;
  v_author uuid;
  v_has_player_targets boolean;
  v_target_type text;
  v_team_id uuid;
  v_existing_id uuid;
  v_prev_starts_at timestamptz;
  v_prev_location text;
  v_notice record;
  v_announcement_id uuid;
begin
  -- The coach explicitly unticked "Notify families" for this edit. Set as a
  -- transaction-local GUC by update_targeted_event.
  if coalesce(current_setting('clubhq.suppress_change_notice', true), 'off') = 'on' then
    return null;
  end if;

  v_time_changed := old.starts_at is distinct from new.starts_at;
  v_loc_changed := coalesce(nullif(btrim(old.location), ''), '')
                   is distinct from coalesce(nullif(btrim(new.location), ''), '');
  if not v_time_changed and not v_loc_changed then
    return null;
  end if;

  -- Correcting a typo on last Tuesday's session is bookkeeping, not news.
  -- Checked against the new time so that pulling a past session forward into
  -- the future still notifies.
  if new.starts_at <= now() then
    return null;
  end if;

  select timezone into v_tz from clubs where id = new.club_id;
  v_tz := coalesce(v_tz, 'America/New_York');

  -- auth.uid() is null when an edit arrives from a service-role context
  -- (backfills, admin tooling); attributing it to the event's creator keeps
  -- author_id non-null so the existing delete policy still has an owner.
  v_author := coalesce(auth.uid(), new.created_by);

  -- Targeting mirrors the events_read RLS policy and send-event-push, so a
  -- notice never reaches someone who can't see the session it's about.
  -- This trigger is DEFERRED precisely so event_players has settled:
  -- update_targeted_event rewrites those rows *after* updating the event.
  select exists (select 1 from event_players where event_id = new.id) into v_has_player_targets;

  if v_has_player_targets then
    v_target_type := 'players';
    v_team_id := null; -- announcements_target_type_team_id_check
  elsif new.team_id is not null then
    v_target_type := 'team';
    v_team_id := new.team_id;
  else
    v_target_type := 'everyone';
    v_team_id := null;
  end if;

  -- Fold into a recent notice for the same event rather than stacking a
  -- second card, keeping the *original* before-values so the diff still
  -- reads from where the coach started.
  select id, source_prev_starts_at, source_prev_location
    into v_existing_id, v_prev_starts_at, v_prev_location
  from announcements
  where source_event_id = new.id
    and auto_generated
    and created_at > now() - event_change_notice_window()
  order by created_at desc
  limit 1;

  if v_existing_id is null then
    v_prev_starts_at := old.starts_at;
    v_prev_location := old.location;
  end if;

  -- The fold can cancel the change out entirely — coach moves 5pm to 6pm,
  -- then moves it back. Nothing actually changed, so retract the notice.
  if v_existing_id is not null
     and v_prev_starts_at is not distinct from new.starts_at
     and coalesce(nullif(btrim(v_prev_location), ''), '')
         is not distinct from coalesce(nullif(btrim(new.location), ''), '') then
    delete from announcements where id = v_existing_id;
    return null;
  end if;

  select * into v_notice from build_event_change_notice(
    new.id, v_prev_starts_at, v_prev_location, new.starts_at, new.location, new.title, v_tz
  );

  if v_existing_id is not null then
    update announcements set
      title = v_notice.title,
      body = v_notice.body,
      category = v_notice.category,
      target_type = v_target_type,
      team_id = v_team_id,
      -- Bumped so the notice re-sorts to the top of the feed and, because
      -- announcement_reads is keyed by id and untouched, stays unread for
      -- anyone who hadn't opened it yet.
      created_at = now()
    where id = v_existing_id;
    v_announcement_id := v_existing_id;
    delete from announcement_player_targets where announcement_id = v_existing_id;
  else
    insert into announcements (
      club_id, team_id, author_id, title, body, category, target_type,
      auto_generated, source_event_id, source_prev_starts_at, source_prev_location
    ) values (
      new.club_id, v_team_id, v_author, v_notice.title, v_notice.body, v_notice.category,
      v_target_type, true, new.id, v_prev_starts_at, v_prev_location
    )
    returning id into v_announcement_id;
  end if;

  if v_target_type = 'players' then
    insert into announcement_player_targets (announcement_id, player_id)
    select v_announcement_id, player_id from event_players where event_id = new.id
    on conflict do nothing;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_announce_event_change on events;

-- CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED, not a plain AFTER
-- trigger: update_targeted_event updates the event row and *then* rewrites
-- event_players. A non-deferred trigger would read the previous targeting
-- and could address the notice to the wrong families. Deferring to commit
-- means every row involved has settled.
create constraint trigger trg_announce_event_change
  after update on events
  deferrable initially deferred
  for each row
  when (
    old.starts_at is distinct from new.starts_at
    or coalesce(btrim(old.location), '') is distinct from coalesce(btrim(new.location), '')
  )
  execute function announce_event_change();

-- ---------- Let the coach opt out of a single notice ----------

-- Signature change (adds p_notify), so the 8-arg version has to go rather
-- than sit alongside as an ambiguous overload — same approach as 0024.
drop function if exists update_targeted_event(uuid, text, text, text, timestamptz, text, uuid, uuid[]);

create or replace function update_targeted_event(
  p_event_id uuid,
  p_type text,
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_notes text,
  p_team_id uuid,
  p_player_ids uuid[],
  p_notify boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_created_by uuid;
  v_is_director boolean;
  v_authorized boolean;
begin
  select club_id, created_by into v_club_id, v_created_by from events where id = p_event_id;
  if v_club_id is null then
    raise exception 'Event not found';
  end if;
  if v_club_id <> current_user_club() then
    raise exception 'Not authorized for this club';
  end if;

  select exists (select 1 from profiles where id = auth.uid() and role = 'director' and club_id = v_club_id) into v_is_director;
  v_authorized := v_is_director or v_created_by = auth.uid();

  if not v_authorized and p_team_id is not null then
    v_authorized := exists (select 1 from team_coaches where team_id = p_team_id and coach_id = auth.uid());
  end if;
  if not v_authorized then
    raise exception 'Not authorized to edit this event';
  end if;

  if p_team_id is not null then
    if not v_is_director and not exists (select 1 from team_coaches where team_id = p_team_id and coach_id = auth.uid()) then
      raise exception 'Not authorized for this team';
    end if;
  elsif p_player_ids is not null and array_length(p_player_ids, 1) > 0 then
    if not v_is_director and exists (
      select 1 from unnest(p_player_ids) pid
      where not exists (
        select 1 from players pl
        join team_coaches tc on tc.team_id = pl.team_id
        where pl.id = pid and tc.coach_id = auth.uid()
      )
    ) then
      raise exception 'Not authorized for one or more selected players';
    end if;
  elsif not v_is_director then
    raise exception 'Only directors can make an event club-wide';
  end if;

  -- Transaction-local (third arg true), so it can't leak into the next
  -- statement on a pooled connection. Read by announce_event_change().
  perform set_config('clubhq.suppress_change_notice', case when p_notify then 'off' else 'on' end, true);

  update events set
    type = p_type,
    title = p_title,
    location = p_location,
    starts_at = p_starts_at,
    notes = p_notes,
    team_id = p_team_id
  where id = p_event_id;

  delete from event_players where event_id = p_event_id;
  if p_player_ids is not null and array_length(p_player_ids, 1) > 0 then
    insert into event_players (event_id, player_id, club_id)
    select p_event_id, pid, v_club_id from unnest(p_player_ids) pid;
  end if;
end;
$$;

grant execute on function update_targeted_event(uuid, text, text, text, timestamptz, text, uuid, uuid[], boolean) to authenticated;
grant execute on function build_event_change_notice(uuid, timestamptz, text, timestamptz, text, text, text) to authenticated;
grant execute on function event_change_notice_window() to authenticated;
