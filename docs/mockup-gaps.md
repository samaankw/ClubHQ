# ClubHQ mockup-vs-reality gap list

Scope: this document lists every place the 15 design mockups
(`/Users/staykurious/Pictures/designs/clubHQ/00.png`–`14.png`) show a feature or
a piece of data that the running app does not actually have, as of the
`design/design-system` branch after the "reskin what exists, no backend work"
conversion. It does not cover pure visual/spacing differences — only content
and functionality gaps: things a user could tap, read, or expect to work that
have nothing behind them today.

Each entry gives: the mockup and element, what ships instead, what would have
to be built (naming the layer), a rough size, and whether anything already
exists to build on.

Sizing key: **Small** = UI-only or a single new query/hook on top of existing
tables. **Medium** = a schema change (new column/table) plus the UI to use it.
**Large** = a new subsystem (storage, a new pipeline, a third-party
integration, or several coordinated schema+backend+UI pieces).

---

## Mockup 01 — Dashboard (staff)

### 1.1 "GETTING STARTED / Your Season Launch" onboarding checklist
- **Shows instead:** Nothing — the dashboard opens straight into "Next Event."
- **Needs:** A definition of what the checklist steps are (add roster, set
  schedule, send intro message) and a way to compute "done" per club —
  likely a small `club_onboarding_state` table or a derived query (teams
  exist? events exist? announcements exist?) plus a dismiss/complete
  interaction if the derived approach isn't good enough. New hook +
  schema column(s) + UI.
- **Size:** Medium.
- **Partial:** `club-management.tsx`'s "Setup Progress" card (Task 24) already
  does exactly this derivation pattern (4 client-computed steps from
  teams/players/coaches, no new queries) for club operations — the same
  approach could be reused for a dashboard version.

### 1.2 "Active Evaluations" with a "2 New" badge, coach + player photo, voice note player with waveform, play button, duration
- **Shows instead:** Nothing on the dashboard. Evaluations are only visible
  after the fact on a player's profile.
- **Needs:** This is two gaps stacked. (a) A concept of "pending/unreviewed
  evaluations" with an unread count — new query against `evaluations`, maybe
  a `reviewed_at` column. (b) A literal audio player with a waveform for a
  recorded voice note. The app's voice-evaluation flow (`app/modals/voice-evaluation.tsx`,
  `supabase/functions/extract-voice-note`) deliberately **never uploads or
  stores raw audio** — speech-to-text happens on-device and only the
  transcript is sent to the backend (see the function's own comment: "this
  function never sees or stores raw audio"). Building a real audio player
  here means reversing that privacy design decision: adding audio recording,
  a storage bucket, upload, and playback — not just a UI widget.
- **Size:** Large (mainly because of 1.2b — the audio pipeline).
- **Partial:** The transcript pipeline and `evaluations.source = 'voice'` exist;
  there's just no stored audio to play back.

### 1.3 "Generate AI Plan" as a standalone dashboard action
- **Shows instead:** Nothing on the dashboard.
- **Needs:** The underlying edge function (`generate-development-plan`)
  already exists and is called from two places — `voice-evaluation.tsx` and
  `evaluate-player.tsx` — always immediately after an evaluation is
  submitted. There's no "pick a pending evaluation and generate a plan"
  entry point from the dashboard, and no notion of an evaluation being
  generated-but-not-yet-planned. Needs a query for "evaluations without a
  development plan yet" plus a dashboard action wired to the existing
  function.
- **Size:** Small–Medium (function already exists; needs the query + UI hook).
- **Partial:** Large — this is mostly wiring, not new backend logic.

### 1.4 "Insights" card — "Passing accuracy down 15%" + recommended drill with steps
- **Shows instead:** Nothing.
- **Needs:** A trend computation (team-average `evaluations.passing` over
  time, compared week-over-week) and a recommendation engine mapping a
  detected weakness to a drill from the `drills` table. This is a new
  analytics computation (probably an edge function or a SQL view) plus a UI
  card.
- **Size:** Large (real trend detection + recommendation logic, not just a query).
- **Partial:** `drills` table and its `skill` column exist, so a
  recommendation could plausibly join on skill — but nothing computes "this
  skill is trending down."

### 1.5 "Passing Accuracy — Last 6 Weeks" line chart
- **Shows instead:** Nothing (no charting library is used anywhere in the app
  except the hand-rolled `View`-transform donut on Pilot Metrics).
- **Needs:** A team-level weekly aggregation query over `evaluations.passing`,
  plus either a charting dependency or another hand-rolled chart (the app
  has no SVG dependency per Task 24's note).
- **Size:** Medium.
- **Partial:** None beyond raw per-evaluation data.

### 1.6 "Attendance — 78%, 14/18 checked in" donut
- **Shows instead:** Nothing on the dashboard. Attendance is tracked, but
  only per-event.
- **Needs:** An `attendance_records` table **already exists** (added in
  `0010_product_readiness.sql`) and is read/written by `app/event/[id].tsx`
  for a single event's roster. There is no club- or team-wide, weekly
  aggregate query anywhere. Needs one new aggregation query (percentage
  present across this week's events) + a donut UI (the pattern already
  exists in `pilot-metrics.tsx`'s hand-rolled `View`-transform donut).
- **Size:** Small–Medium — this is the smallest "invented-looking" stat on
  the dashboard to actually build, since both the data and a donut-drawing
  pattern already exist.
- **Partial:** Large — table + per-event UI + a working donut-chart pattern
  elsewhere in the codebase all already exist; only the weekly aggregate
  query and the dashboard card are missing.

---

## Mockup 02 — Player profile

### 2.1 Goals / Assists / Matches / Rating stat tiles, jersey number, nationality, preferred foot
- **Shows instead:** Four tiles grouping the ten real 1–10 evaluation-skill
  columns (Technical, Game IQ, Speed, Positioning, averaged from the latest
  evaluation) — confirmed in `app/player/[id].tsx` and Task 23's report. The
  `players` table (`supabase/migrations/0001_init.sql` +
  `0010_product_readiness.sql`) has only `full_name`, `birth_date`,
  `position`, `photo_url`, `team_id`, `parent_id`, `archived_at` — no jersey
  number, nationality, preferred foot, and there is no match/game-result data
  anywhere in the schema (no `matches` or `game_stats` table exists at all).
- **Needs:** A genuinely new subsystem: a `matches`/`games` results table
  (opponent, score, per-player goals/assists/minutes), plus schema columns
  on `players` for jersey number, nationality, and preferred foot, plus new
  queries/hooks and UI. This is real match-stat tracking, not a cosmetic
  add.
- **Size:** Large.
- **Partial:** None — this is the single biggest content gap in the entire
  mockup set. The evaluation-skill system is a genuinely different feature
  that happens to occupy the same screen real estate.

### 2.2 "Rating Last 10 Games" bar chart
- **Shows instead:** A `ProgressBar` row per past evaluation with delta
  arrows (reusing the existing `overallScore`/`trend` computation).
- **Needs:** Same root cause as 2.1 — there is no per-game rating, only
  per-evaluation. Even with a real bar-chart component, there's no
  "per-game" number to plot without the matches subsystem above.
- **Size:** Large (blocked on 2.1).
- **Partial:** The trend/history computation exists for evaluations; just not
  for games.

---

## Mockup 03 — AI plan review

### 3.1 "Regenerate" button
- **Shows instead:** No such button — only "Mark Reviewed" / "Publish to
  Parent," per Task 23's report.
- **Needs:** A `regenerate_development_plan` RPC (there's a
  `generate-development-plan` edge function that creates a plan from an
  evaluation, but no path to re-run it against an existing plan, or a
  server-side notion of "regenerate" vs. "generate new").
- **Size:** Small–Medium (the generation function already exists; needs a
  route/RPC that re-invokes it against the same evaluation and replaces or
  versions the draft).
- **Partial:** Large — `generate-development-plan` does the actual work; the
  gap is only the "regenerate an existing draft" entry point.

### 3.2 Per-goal edit affordance (pencil icon on each priority/goal card)
- **Shows instead:** Read-only numbered cards.
- **Needs:** An `update_development_plan_priority` RPC or a direct
  authorized update against `development_plans.priorities` (currently a
  jsonb blob with no per-item update path) plus an edit UI.
- **Size:** Medium.
- **Partial:** None.

---

## Mockup 04 — Parent progress

### 4.1 "Performance Trend" line chart with "+12% Growth this month" and a "SEASON 2026" badge
- **Shows instead:** The same per-evaluation `ProgressBar` list used on the
  player profile (2.2) — no month-over-month line chart, no computed growth
  percentage, no season concept tied to evaluation data (`teams.season` is a
  free-text field, not linked to development plans).
- **Needs:** A month-bucketed trend query over evaluation scores, a
  percentage-growth calculation, and a real line-chart component.
- **Size:** Medium.
- **Partial:** The underlying per-evaluation scores exist; only the
  aggregation and charting are missing.

### 4.2 "Message Coach Henderson" button
- **Shows instead:** Navigates to the general `(tabs)/messages` tab, not a
  coach-specific or player-specific thread (per Task 23: "there is no
  player-to-coach conversation resolver in the codebase to wire to").
- **Needs:** A resolver that finds-or-creates a direct conversation between
  the parent and the player's assigned coach — new RPC/query against
  `conversations`/`conversation_participants`.
- **Size:** Small–Medium.
- **Partial:** The messaging schema and conversation model already exist and
  support direct conversations; only the resolver is missing.

*(Homework list, per-item progress, and drill video button on this screen
are real and already wired — not a gap.)*

---

## Mockup 05 — Club operations

### 5.1 "View Archive" link
- **Shows instead:** No link; archived teams are simply invisible (every
  query filters `archived_at is null`), per Task 24's report.
- **Needs:** A new query (`archived_at is not null`) and a route/screen to
  list and restore archived teams. The `archiveTeam()` action that produces
  archived rows already exists and is unchanged.
- **Size:** Small.
- **Partial:** Large — soft-archive already exists on both `teams` and
  `players`; only the read-back view is missing.

*(The "Setup Progress" checklist on this same screen is real and computed
client-side from existing data — not a gap; see 1.1's "Partial" note.)*

---

## Mockup 06 — Profile

No gaps found. Avatar upload, coach bio edit, club access code + share,
Administration list, notification toggles, sign out, and delete account are
all wired to real data and real handlers (Task 18).

---

## Mockup 07 — Drill library

### 7.1 Per-drill thumbnail/photo image
- **Shows instead:** A decorative placeholder box (play icon if `video_url`
  is set, else a generic icon) — per Task 24: "no real thumbnail image
  exists in the data model."
- **Needs:** A `thumbnail_url` column on `drills` (`supabase/migrations/0003_drills_library.sql`
  has only `video_url`, no image field) plus an upload path (the app already
  has a `club-media` storage bucket used for avatars/coach photos that could
  be reused).
- **Size:** Small–Medium.
- **Partial:** Storage bucket and upload pattern already exist elsewhere
  (`profile.tsx`'s avatar upload) and could be copied.

### 7.2 "Load More Drills" pagination
- **Shows instead:** All drills for the club load in one query; no
  range/offset or `Load More` control exists in `manage-drills.tsx`.
- **Needs:** Paginated query (`.range()`) + a "Load more" button/footer.
- **Size:** Small.
- **Partial:** None needed beyond the query change — not likely to matter
  until a club has a large drill library.

---

## Mockup 08 — Director copilot

> Note: the task brief's "known gaps" list attributes the invented
> "GROUNDED IN 1,240 DATA POINTS" stat to **mockup 09 (Pilot Metrics)**. That
> stat and its fix are actually on **mockup 08 (Director Copilot)** —
> confirmed by viewing both mockups and by Task 24's report, which describes
> the fix ("Badge reads 'GROUNDED IN YOUR LIVE DATA' rather than a fabricated
> '1,240 data points' figure") entirely under `(tabs)/copilot.tsx`. Mockup 09
> has no such badge at all. This is flagged as a correction, not a new gap.

### 8.1 "GROUNDED IN 1,240 DATA POINTS" (see note above)
- **Shows instead:** "GROUNDED IN YOUR LIVE DATA" — the number was removed
  rather than fabricated.
- **Needs:** If a real count is wanted, it would need a defined metric (e.g.
  total evaluations + homework completions + messages) and a query to sum
  it.
- **Size:** Small.
- **Partial:** N/A — deliberately left unbacked, correctly.

### 8.2 "History" link (top right)
- **Shows instead:** Nothing — no such link, and no way to revisit a past
  conversation. Confirmed by reading `(tabs)/copilot.tsx`: there is no
  `history`/`log` route, and chat messages live only in local component
  state (`useState<ChatMessage[]>`), lost on navigating away.
- **Needs:** A `copilot_queries` (or similar) table to persist question +
  answer pairs per director/club, a list/history screen, and a small change
  to the edge function or client to write a row per exchange.
- **Size:** Medium.
- **Partial:** None — the `director-copilot` edge function only reads
  (`teams`, `players`, `evaluations`, `development_plans`, `homework_items`)
  and never writes a log of its own activity.

---

## Mockup 09 — Pilot metrics

No fabricated-data gaps found here — this screen was double-checked against
its own report (Task 24) and against the code. "Director's Analysis" framing
copy, the two `StatTile` rows (`ROSTER EVAL (7D)`, `TOTAL EVALS (30D)`), the
"Usage Mix" voice-vs-manual donut, and the "What to Watch" bullets are all
computed from real `supabase` queries left untouched by the conversion. (See
the note under Mockup 08 above for the one thing this task's known-gaps list
misattributed to this screen.)

---

## Mockup 10 — Announcements

No gaps found. Category filter chips, search, pinned accent-bar cards, and
the FAB are all backed by real data (`FILTER_BUCKETS`,
`lib/announcementCategories.ts`, `useRecentAnnouncements`) per Task 22's
report.

---

## Mockup 11 — New announcement

### 11.1 "AI Polishing" affordance next to the message field
- **Shows instead:** A purely decorative sparkles icon + label — per Task
  25: "no such feature exists anywhere in this codebase, so it is not wired
  to any handler, RPC, or state."
- **Needs:** An edge function that takes draft announcement text and returns
  a polished/shortened version (a small, well-scoped Claude call, similar in
  shape to `extract-voice-note`), plus a "Polish" button wired to it.
- **Size:** Medium (new edge function + UI, but a small, well-understood
  shape given other AI edge functions already exist in this codebase).
- **Partial:** The app already has three working Claude-backed edge
  functions (`extract-voice-note`, `generate-development-plan`,
  `director-copilot`) to model this on.

### 11.2 "Drafts" link (top right)
- **Shows instead:** Nothing — posting is immediate; there's no save-as-draft
  state. Confirmed no `draft`/`Draft` reference anywhere in
  `create-announcement.tsx`.
- **Needs:** A `status` column on `announcements` (or a separate `drafts`
  table) and a drafts-list screen.
- **Size:** Medium.
- **Partial:** None.

### 11.3 "Notifications will be sent to 42 accounts via Push & Email" recipient-count preview
- **Shows instead:** Nothing — no recipient count is computed or displayed
  anywhere in `create-announcement.tsx`.
- **Needs:** A count query against the resolved audience (everyone/team/
  players/parents) before posting. Push delivery already exists
  (`supabase/functions/send-announcement-push`); email delivery does not
  exist anywhere in the codebase (no email-sending edge function or
  integration was found), so the "& Email" half of this claim is a third
  gap on top of the missing count — it would need a transactional email
  provider integration.
- **Size:** Small (count) + Large (email sending, if that half is wanted).
- **Partial:** Push notification delivery already exists and is real; the
  count and the email channel are both new.

### 11.4 "Advanced Filter" link next to audience selection
- **Shows instead:** Nothing beyond the four audience chips (Everyone/
  Training Group/Selected Players/Selected Parents) — confirmed no
  "advanced" or filter-beyond-audience-type logic in the file.
- **Needs:** Depends on what "advanced" would mean (by position, by age
  group, etc.) — underspecified in the mockup itself.
- **Size:** Small–Medium, but low-confidence without a defined spec.
- **Partial:** The four-way audience targeting it would extend already
  works.

---

## Mockup 12 — Schedule

*(This is the gap already scoped precisely in Task 22's report — restated
here with the verification that distinguishes it from a bigger, false
alarm.)*

### 12.1 Month header with prev/next arrows + horizontal week-day strip with a selected day
- **Shows instead:** A flat day-grouped list of all upcoming events (no
  month view, no day-selection state at all in `schedule.tsx`).
- **Needs:** Client-side calendar state (selected month/day) — this is a
  **UI-only** change; the existing `events` query already returns everything
  needed to filter/group by day, it just isn't currently sliced that way.
- **Size:** Small–Medium (state + calendar-strip component; no schema or
  query change required).
- **Partial:** Large — no new data needed at all, only new UI state and
  layout.

### 12.2 Attendee avatar stack + "21 Going" count per event row
- **Shows instead:** Nothing — event rows show only icon/title/audience
  badge/time/location.
- **Needs:** **Verified this is a smaller gap than it looks.** An
  `event_rsvps` table already exists (`supabase/migrations/0001_init.sql`)
  and is already fetched and written by `app/event/[id].tsx`. The Schedule
  list's own query
  (`select("*, teams(name, age_group), event_players(players(id, full_name))")`)
  simply doesn't join it. This needs one added join/query (RSVP status +
  player photos per event) and an avatar-stack UI component that doesn't
  exist yet — not a new data model.
- **Size:** Small–Medium.
- **Partial:** Large — the RSVP table, its read/write pattern, and player
  photo data all already exist; only the join in this one screen's query and
  a new (reusable) avatar-stack component are missing.

---

## Mockup 13 — New event

### 13.1 "Save Draft" link (top right)
- **Shows instead:** Nothing — no draft concept, same as 11.2. Confirmed no
  `draft`/`Draft` reference in `create-event.tsx`.
- **Needs:** Same shape as 11.2 — a `status`/draft mechanism on `events` or a
  separate drafts table.
- **Size:** Medium.
- **Partial:** None. Could share a design with 11.2 if both are built.

*(Event type grid, date/time fields, audience targeting, and recurrence
toggle are all real and wired — not gaps.)*

---

## Mockup 14 — Club home (parent)

### 14.1 "Club Status — 12 Active" (teams this season) and "Players — 142 Evaluated this week" stat tiles
- **Shows instead:** Nothing — `dashboard.tsx`'s only stat tiles are "Club
  This Week" (games/practices/tournaments/club events from `useWeekCounts`).
  There is no active-team-count tile and no "evaluated this week" tile
  anywhere in the dashboard.
- **Needs:** Two new small aggregate queries: `count(teams) where
  archived_at is null` (trivial — the same filter `club-management.tsx`
  already uses elsewhere), and `count(distinct player_id) from evaluations
  where created_at >= start_of_week` (new). Plus two `StatTile`s.
- **Size:** Small.
- **Partial:** The team-archive filter pattern already exists elsewhere in
  the codebase; the "evaluated this week" count is new but simple.

*(The club crest/"Read our full story" bio section and "Meet the Coaches"
list on this same screen — `ClubBioSection.tsx` / `CoachesSection.tsx` — are
real, fully wired components, not fabricated content. Verified by reading
both files: real club data, real coach roster query, no placeholder text
beyond the club's actual bio copy.)*

---

## Summary table

| # | Mockup | Element | Size | Backing exists? |
|---|--------|---------|------|------|
| 1.1 | 01 | Season-launch checklist | Medium | Pattern exists (club-management) |
| 1.2 | 01 | Active Evaluations + voice note player | Large | Transcript pipeline only, no audio storage |
| 1.3 | 01 | "Generate AI Plan" dashboard action | Small–Medium | Function exists, needs wiring |
| 1.4 | 01 | Insights / recommended drill | Large | No trend logic |
| 1.5 | 01 | Passing accuracy trend chart | Medium | Raw data only |
| 1.6 | 01 | Attendance donut | Small–Medium | Table + per-event UI + donut pattern all exist |
| 2.1 | 02 | Goals/Assists/Matches/Rating, jersey/nationality/foot | Large | Nothing |
| 2.2 | 02 | Per-game rating bar chart | Large | Blocked on 2.1 |
| 3.1 | 03 | Regenerate | Small–Medium | Generation function exists |
| 3.2 | 03 | Per-goal edit | Medium | Nothing |
| 4.1 | 04 | Performance trend + growth % | Medium | Raw scores only |
| 4.2 | 04 | Message-the-coach resolver | Small–Medium | Messaging schema exists |
| 5.1 | 05 | View Archive | Small | Archive data exists, no read view |
| 7.1 | 07 | Drill thumbnails | Small–Medium | Storage bucket pattern exists |
| 7.2 | 07 | Load More pagination | Small | Nothing needed but the query |
| 8.2 | 08 | Copilot History | Medium | Nothing persisted |
| 11.1 | 11 | AI Polishing | Medium | 3 similar edge functions exist as a model |
| 11.2 | 11 | Drafts (announcement) | Medium | Nothing |
| 11.3 | 11 | Recipient count / email delivery | Small + Large | Push exists; count and email don't |
| 11.4 | 11 | Advanced Filter | Small–Medium | Underspecified |
| 12.1 | 12 | Month header + day strip | Small–Medium | UI-only, no new data needed |
| 12.2 | 12 | Attendee avatars + "N Going" | Small–Medium | RSVP table + pattern already exist |
| 13.1 | 13 | Save Draft (event) | Medium | Nothing |
| 14.1 | 14 | Active-team / evaluated-this-week tiles | Small | Filter pattern exists; one new query |

**By size:** Small — 5 (5.1, 7.2, 11.3-count, 14.1, part of 11.4). Small–Medium
— 8 (1.3, 1.6, 3.1, 4.2, 7.1, 11.4, 12.1, 12.2). Medium — 7 (1.1, 1.5, 3.2,
4.1, 8.2, 11.1, 11.2, 13.1 — note: 8 items). Large — 4 (1.2, 1.4, 2.1, 2.2)
plus the email-sending half of 11.3.

*(Mockups 06, 09, 10 contributed no gaps; mockup 08's known "1,240 data
points" item is the mislabeled entry — see the note under that section.)*

---

## What to build first

1. **12.2 — RSVP join + attendee avatars on the Schedule list.** The
   table, the read/write pattern, and the player-photo data all already
   exist; this is "add a join to one query and draw circles," which unlocks
   a big chunk of mockup 12's fidelity (the "N Going" badge, which is the
   single most information-dense element missing from that screen) for very
   little new code.

2. **12.1 — Month header + week-day strip.** Zero data-layer work — it's
   pure client state and layout on top of the events already being fetched.
   Pairs naturally with 12.2 since both land in the same file and the same
   task.

3. **1.6 — Weekly attendance donut on the dashboard.** Same story as 12.2:
   the table exists, the per-event UI already writes to it, and a working
   donut-drawing pattern already exists in `pilot-metrics.tsx`. One new
   aggregate query turns an already-real feature (attendance) into a
   dashboard-visible one.

4. **5.1 — View Archive.** The cheapest possible win: the archive itself
   (soft-delete via `archived_at`) is fully built and already used by the
   "Archive Team" action; there is simply no way to see what's been
   archived. One query, one screen.

**Not worth building:**

- **1.2's voice-note player (audio playback with a waveform).** The app's
  privacy design explicitly avoids ever storing raw audio — that's a
  deliberate architectural choice (stated in the edge function's own
  comments), not an oversight. Building this means reversing that decision
  to add value that's almost entirely cosmetic (coaches already get the
  transcript). Skip unless there's a real product reason to start storing
  audio.
- **2.1/2.2's match-stats subsystem (Goals/Assists/Matches/Rating, jersey
  number, nationality, preferred foot).** This is the largest single gap in
  the whole set, and it's a different feature area (match/game results)
  bolted visually onto the player-development feature the app actually has.
  Worth scoping as its own project if the club actually wants match-stat
  tracking — not a design-system follow-up task.
- **11.3's email delivery.** Push notifications already cover the
  "recipients get notified" need. Adding a transactional email provider
  purely to make one sentence of copy literally true is a poor trade — build
  the recipient *count* (small, real value) and drop "& Email" from the copy
  instead.
- **1.4's Insights/recommended-drill card.** This wants real trend detection
  plus a recommendation engine — a meaningfully hard analytics feature, not
  a quick add — for a single card whose value is speculative until there's
  evidence directors would act on the recommendation.

---

## Mockup 16 — Players empty state

### 16.1 "Import Roster" secondary button
- **Shows instead:** Only **Add Single Player**, per the 2026-08-29 decision
  (Task 29) to not ship a button with nothing behind it.
- **Needs:** No CSV import exists anywhere in the codebase — no parser, no
  column-mapping UI, no bulk-insert RPC. Building it means a file picker
  (web + native), a CSV-parsing dependency, a mapping step (name/position/
  birth date columns aren't guaranteed to be named or ordered consistently),
  and a bulk-insert path that still respects `players_insert_staff`'s
  director-only RLS check per row (or a dedicated RPC that validates the
  whole batch against one team/club before inserting).
- **Size:** Medium.
- **Partial:** None — `players_insert_staff` (single-row insert) and the
  single-player "Add Player" form on Club Management are the only existing
  write path; nothing in the schema or edge functions anticipates a batch.
