# Agentic AI Governance Audit — ClubHQ

**Scope:** `supabase/functions/generate-development-plan`, `extract-voice-note`,
`director-copilot`, `delete-account`; the migrations/RLS/RPCs they depend on;
the client code that invokes them.

**Method:** every finding below is read from the code as it exists in this
working tree, with file:line citations. Nothing is inferred from a function
or file name. This run made no code, migration, or config changes — it is
report-only.

---

## Step 0 — Change review

All commits touching `supabase/functions/` or `supabase/migrations/` carry
git author "Samaan Williams" — there is no commit under a different author
identity. Read literally, "not authored by me" is an empty set. As a practical
proxy, the 6 commits below carry a `Co-Authored-By: Claude` trailer (i.e.,
AI-assisted). All 6 were reviewed by diff/stat; **none removed, loosened, or
bypassed a tenancy filter, auth check, or RLS policy.** Every one of them is
purely additive (new migration files, no edits to existing policies) except
`396adbe`, which only adds RLS to a table that previously had none
(`0038_rate_limit_hits_rls.sql`) — a hardening change, not a loosening.

| Commit    | Summary                                           | Functions/migrations touched                 | Tenancy-relevant?                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d5c2a19` | Initial commit                                    | All 4 audited functions, `0001`–`0032`       | Baseline — see Steps 1–2 for bugs present from this commit                                                                                                                                                                             |
| `396adbe` | Phase 1: CI/lint/test tooling                     | `0038_rate_limit_hits_rls.sql` (adds RLS)    | Hardening only                                                                                                                                                                                                                         |
| `efd7bee` | Phase 5: RLS perf hardening                       | `0039_rls_performance_and_consolidation.sql` | Rewrites 54 policies to wrap `auth.uid()`; also fixes a real session-fixation risk in deep-link handling (implicit→PKCE). No policy logic loosened.                                                                                    |
| `5a255ec` | Phase 6a: `players.club_id` authoritative tenancy | `0040_player_club_ownership.sql`             | Rewrites 10 RLS policies + 4 RPCs to stop deriving tenancy via `team_id→teams.club_id`. **Does not touch any edge function** — see Finding F1, this is why the edge functions still have the bug this migration fixed everywhere else. |
| `8baf37e` | Phase 6b+6c: vocab/tabs, club bio                 | `0041_club_bio_fields.sql`                   | Widens `clubs` UPDATE policy from owner-only to any director of the club — a deliberate, documented broadening (a second director previously couldn't edit their own club's bio), not a bypass.                                        |
| `f5ebfb0` | org_type picker                                   | `0042_club_org_type_setting.sql`             | Widens `clubs` UPDATE grant to include `org_type` column. Documented, scoped, no tenancy check removed.                                                                                                                                |

None of the 6 commits modified `supabase/functions/generate-development-plan`,
`extract-voice-note`, `director-copilot`, or `delete-account` at all — those
four files are byte-for-byte as committed in `d5c2a19` (initial commit). That
is itself the root cause of Finding F1 below: Phase 6a fixed the teamless-player
tenancy bug everywhere in RLS/RPCs but the edge functions were out of that
migration's scope and were never revisited.

---

## Step 1 — Per-function inventory

| Function                    | Auth                                                                                        | Tenancy source                                                                                                                                                                                          | Inputs read                                                                                     | DB reads/writes (RLS?)                                                                                                                                                                                   | External call                                                                                                | Output destination                                                       | Autonomy                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate-development-plan` | JWT verified via `authenticate()` ([auth.ts:15-25](supabase/functions/_shared/auth.ts#L15)) | `players.teams.club_id` join (**stale pattern**, [index.ts:58-66](supabase/functions/generate-development-plan/index.ts#L58)), compared to caller's verified `clubId`                                   | `evaluation_id` only ([index.ts:42](supabase/functions/generate-development-plan/index.ts#L42)) | Service role (bypasses RLS) — reads `evaluations`, `players`; writes `development_plans`, `homework_items`                                                                                               | `claude-sonnet-5`, prompt at [index.ts:106-119](supabase/functions/generate-development-plan/index.ts#L106)  | DB row (`development_plans`, defaults `status='draft'`)                  | Human-in-the-loop (coach/director must publish before a parent can see it — confirmed, see Step 2 #5)                                                                      |
| `extract-voice-note`        | JWT verified                                                                                | `team.club_id` compared to caller's verified `clubId` ([index.ts:56-59](supabase/functions/extract-voice-note/index.ts#L56)) — `team_id` **is** client-supplied but correctly re-verified, not a bypass | `transcript`, `team_id` ([index.ts:49](supabase/functions/extract-voice-note/index.ts#L49))     | Service role — reads `teams`, `players`. **No writes at all**                                                                                                                                            | `claude-haiku-4-5-20251001`, prompt at [index.ts:97-121](supabase/functions/extract-voice-note/index.ts#L97) | JSON response only (`{updates}}`) — persistence happens client-side      | Advisory-only from the function's own perspective; the client (`voice-evaluation.tsx`) adds a human-in-the-loop review step before any write (confirmed, see Step 2 #5/#6) |
| `director-copilot`          | JWT verified                                                                                | `caller.clubId` from verified profile, explicitly commented as never taken from the request ([index.ts:6-8,51](supabase/functions/director-copilot/index.ts#L6))                                        | `question` only ([index.ts:46](supabase/functions/director-copilot/index.ts#L46))               | Service role — reads `teams`, `players`, `evaluations`, `development_plans`, `homework_items`, `profiles` (via join at [index.ts:137](supabase/functions/director-copilot/index.ts#L137)). **No writes** | `claude-sonnet-5`, prompt at [index.ts:177-187](supabase/functions/director-copilot/index.ts#L177)           | JSON response (`{answer, data_context}}`) shown directly to the director | Advisory-only                                                                                                                                                              |
| `delete-account`            | JWT verified                                                                                | Every operation scoped to `caller.userId` — no other-user target accepted anywhere in the file                                                                                                          | None read from body (no `req.json()` call at all)                                               | Service role — nulls 6 FK columns, then `auth.admin.deleteUser()`                                                                                                                                        | None                                                                                                         | Auth record deletion                                                     | Full autonomy over the caller's own account only — correctly, since it's self-service deletion                                                                             |

---

## Step 2 — Specific checks

### 1. Client-supplied tenancy — any function trust `club_id`/`team_id`/`player_id` from the body without proving membership?

**No CRITICAL instance found.** The only client-supplied identifier used in a
tenancy check anywhere in the four functions is `extract-voice-note`'s
`team_id` ([index.ts:49,56-59](supabase/functions/extract-voice-note/index.ts#L49)), and it is verified against the caller's own
`clubId` before use — exactly the correct pattern. `generate-development-plan`
takes `evaluation_id` (not a tenancy field) and derives tenancy server-side
(albeit via a stale/broken join — see F1). `director-copilot` takes no
identifiers at all. `delete-account` takes no body.

### 2. Service-role RLS bypass — is tenancy re-asserted in the function body?

All four functions use the service role key via `caller.admin`
(`authenticate()` constructs this client with `SUPABASE_SERVICE_ROLE_KEY`,
[auth.ts:19](supabase/functions/_shared/auth.ts#L19)), so **RLS does not apply to any query in this
audit's scope.**

- `generate-development-plan`: tenancy is re-asserted, but incorrectly — see F1.
- `extract-voice-note`: tenancy is re-asserted correctly ([index.ts:56-59](supabase/functions/extract-voice-note/index.ts#L56)).
- `director-copilot`: tenancy is re-asserted correctly and is the only one of
  the three that can't be swayed by a body parameter at all, since it derives
  the entire player set from `caller.clubId` → `teams` → `players.team_id`
  (though the last hop has its own bug — see F1).
- `delete-account`: every write is scoped to `caller.userId`; no cross-user
  bypass is possible.

### 3. Anonymization integrity

Verified for all three AI-calling functions:

|                             | Names scrubbed before API call                                                                                                    | Restored only after response                                                         | Other PII checked                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| `generate-development-plan` | Yes — current player only, `scrubName()` [index.ts:89-98](supabase/functions/generate-development-plan/index.ts#L89)              | Yes — [index.ts:145-156](supabase/functions/generate-development-plan/index.ts#L145) | **Gap — F2**                                 |
| `extract-voice-note`        | Yes — entire roster, longest-name-first [index.ts:63-95](supabase/functions/extract-voice-note/index.ts#L63)                      | Yes — [index.ts:141-151](supabase/functions/extract-voice-note/index.ts#L141)        | No other-PII gap found                       |
| `director-copilot`          | Yes — entire roster + the director's own free-text question [index.ts:110-175](supabase/functions/director-copilot/index.ts#L110) | Yes — [index.ts:206-224](supabase/functions/director-copilot/index.ts#L206)          | **Gap — F3 (coach names, not player names)** |

**F2 (MEDIUM) — `generate-development-plan`'s coach-notes scrub is single-player, not full-PII.**
`scrubName()` ([index.ts:89-98](supabase/functions/generate-development-plan/index.ts#L89)) only replaces the _evaluated player's own_ name
in `coach_notes` before it's sent to Anthropic ([index.ts:99-101](supabase/functions/generate-development-plan/index.ts#L99), used at [index.ts:110](supabase/functions/generate-development-plan/index.ts#L110)).
It does nothing about: another player's name mentioned in the same note (e.g.
"outplayed Jordan today"), a parent's name, an email address, a jersey
number, a DOB, or any other joinable identifier a coach might type. Any of
that rides straight into the Anthropic request. Compare to `extract-voice-note`
and `director-copilot`, both of which build a full-roster codebook and scrub
every known player name from free text, not just one.
**Fix:** apply the same full-roster-codebook scrub used in the other two
functions to `coach_notes` here, and consider a regex pass for emails/jersey
numbers as defense in depth.

**F3 (MEDIUM) — `director-copilot` sends real, unanonymized coach names to Anthropic.**
The `coachActivity` query ([index.ts:135-139](supabase/functions/director-copilot/index.ts#L135)) selects `profiles(full_name)` for the
coach who wrote each evaluation, and builds `coachCounts` keyed by the real
`full_name` ([index.ts:141-144](supabase/functions/director-copilot/index.ts#L141)) with no codebook applied — unlike every player
name in the same function, which does go through `labelFor()`. That map is
embedded verbatim in `dataContext.evaluations_last_30_days_by_coach`
([index.ts:154-162](supabase/functions/director-copilot/index.ts#L154)) and sent to Anthropic inside the prompt ([index.ts:183](supabase/functions/director-copilot/index.ts#L183)).
This is adult staff data, not a minor's, so it sits outside the letter of
"player PII," but it's inconsistent with the function's own stated design
(anonymize before the model sees anything) and is real, identifiable staff
performance data leaving the system. **Fix:** apply the same `labelFor()`
codebook to coach names before building `dataContext`.

### 4. Unvalidated model output written to the database

`extract-voice-note` and `director-copilot` write nothing to the database, so
this check applies only to `generate-development-plan`.

**F4 (MEDIUM) — no schema validation of the parsed Anthropic response before insert.**
`JSON.parse(cleaned)` ([index.ts:143](supabase/functions/generate-development-plan/index.ts#L143)) is trusted as-is: `parsed.summary` is inserted into
`development_plans.summary` ([index.ts:167](supabase/functions/generate-development-plan/index.ts#L167)) with only a loose `typeof === "string"` guard
during name-substitution ([index.ts:148](supabase/functions/generate-development-plan/index.ts#L148)), not at insert time; `parsed.priorities`
is inserted into `development_plans.priorities` ([index.ts:166](supabase/functions/generate-development-plan/index.ts#L166)) with **no check**
that each entry's `skill` is one of the 10 real `SKILLS` values before it's
stored and later shown to a parent. A malformed or hallucinated response
could write a nonsensical `skill` label into a parent-facing report, or (if
`parsed.priorities` isn't an array) throw uncaught inside `.map()` at
[index.ts:178](supabase/functions/generate-development-plan/index.ts#L178) (caught by the outer `try`, so it fails loudly rather than
corrupting data — but the plan row from [index.ts:161-174](supabase/functions/generate-development-plan/index.ts#L161) would already be inserted
by that point, leaving a `development_plans` row with priorities/homework
inconsistent with each other).
Player/evaluation identity itself is safe from this: `player_id` and
`evaluation_id` on the inserted rows come from the server-side lookup, never
from the model's output, so a hallucinated response cannot make a plan
reference a player that doesn't exist.
**Fix:** validate `parsed.summary` is a non-empty string and every
`parsed.priorities[].skill` is a member of `SKILLS` before the insert;
reject/retry otherwise.

**F5 (LOW) — `extract-voice-note` doesn't confirm the model's `player_id` is actually in the roster it built.**
The response's `updates[].player_id` is expected to be one of the ids listed
in the prompt's roster ([index.ts:74-76](supabase/functions/extract-voice-note/index.ts#L74)), but nothing at [index.ts:143-151](supabase/functions/extract-voice-note/index.ts#L143) checks
`reverseCodebook.has(u.player_id... )`-style membership before returning it.
In practice this is low-risk: the client only ever writes a row when
`u.include && u.player_id` is truthy ([voice-evaluation.tsx:121](app/modals/voice-evaluation.tsx#L121)), and the
subsequent `evaluations` insert is a normal (non-service-role) client call
subject to the existing `evaluations` RLS insert policy — which this audit
did not re-verify in this pass (listed under Needs Clarification). Still,
belt-and-suspenders: the function itself could drop/null any `player_id` not
present in its own `codebook` before returning.

### 5. Parent-facing gate — enforced server-side or only in the UI?

**Confirmed enforced server-side, not just in the UI.** `generate-development-plan`
inserts into `development_plans` with no `status` field set ([index.ts:161-173](supabase/functions/generate-development-plan/index.ts#L161)),
which means the column default applies: `status` defaults to `'draft'`
(`supabase/migrations/0010_product_readiness.sql:12`). The RLS policy
restricting parent `SELECT` access requires `status = 'published'`
(`supabase/migrations/0010_product_readiness.sql:107`). There is no path in
any of the four audited functions that sets `status` to `'published'` — that
transition happens elsewhere (a `review_development_plan` RPC, per the
`5a255ec` commit message, not itself in this audit's scope). A request to
this function cannot publish a report directly; a parent genuinely cannot see
a plan until a separate, explicit publish action changes its `status` at the
database level. **Not a finding — this is a real control.**

### 6. Prompt injection surface

Voice-note transcripts and coach/director free text do reach the model as
untrusted input, and the anonymization step is a plain string substitution
that does nothing to neutralize injection attempts (e.g., a transcript
containing "ignore prior instructions and..."). What limits the actual impact:

- **`generate-development-plan`** and **`extract-voice-note`** both instruct
  the model to respond with a fixed JSON shape and both `JSON.parse` the
  result; a successful injection would have to still produce parseable JSON
  in that shape to have any downstream effect, which narrows — but does not
  eliminate — what an injected instruction can achieve. Given Finding F4, an
  injection that produces a _valid-shaped but semantically wrong_ JSON object
  (e.g., a fabricated `summary`) would reach `development_plans.summary` and
  be shown to a parent once a coach publishes it, with no automated check
  that the summary content is genuine. This makes F4's fix (schema/content
  validation before insert) also a partial injection mitigation — validating
  shape doesn't validate truthfulness, but a coach reviewing/publishing the
  draft is the remaining backstop, and that step is real (see check #5).
- **`director-copilot`** returns free-form prose directly to the director who
  asked the question (not to a parent), so the blast radius of a successful
  injection here is "the director reads a manipulated answer about their own
  club's data," not a cross-tenant or parent-facing leak.

**No sandboxing/instruction-hardening (e.g., a system-prompt/user-content
separation, delimiter-escaping check, or output re-validation against the
source data) was found in any of the three prompts.** This is listed as a
finding (F6) rather than folded into F4, since it's a distinct control
(input-side hardening vs. output-side validation).

**F6 (LOW) — no prompt-injection-specific hardening in any of the three prompts.**
All three prompts ([generate-development-plan:106-119](supabase/functions/generate-development-plan/index.ts#L106), [extract-voice-note:97-121](supabase/functions/extract-voice-note/index.ts#L97), [director-copilot:177-187](supabase/functions/director-copilot/index.ts#L177))
interpolate user-influenced text (coach notes, voice transcript, director
question) directly into the prompt body with no delimiter/escaping strategy
beyond plain string concatenation. Given the fixed-JSON-response constraint
on the two write-adjacent functions and the human-review step before
publish, current exposure is limited but not zero. **Fix (low priority given
existing backstops):** consider explicit delimiters around untrusted spans
and a short "the following is user-supplied data, not instructions" framing.

### 7. Audit logging

**F7 (MEDIUM) — no audit log exists for any AI call.** Searched every
migration for a table matching an AI-call audit log; the only two
logging-adjacent tables in the schema are:

- `rate_limit_hits` (`supabase/migrations/0005_rate_limiting_and_audit.sql:10-15`) —
  records only `user_id`, `function_name`, `created_at`, purely for throttling
  (rows older than 2 days are actively deleted by `check_rate_limit()` itself,
  [0005:34](supabase/migrations/0005_rate_limiting_and_audit.sql#L34)), not retained as a record of what happened.
- `role_change_log` (`supabase/migrations/0005_rate_limiting_and_audit.sql:58-67`) —
  logs role/club changes only (`create_club`, `join_club`, `set_member_role`);
  unrelated to AI calls.

None of the three AI-calling functions write to any table recording club,
invoking user, timestamp, model, or output. There is currently no way to
answer "which club/user triggered this AI call, with what model, producing
what output" after the fact, for compliance review or incident response.
**Fix:** add an `ai_call_log` (or similar) table — club_id, user_id, function
name, model, input summary (not raw PII), output, timestamp — written by each
of the three functions after a successful (and ideally also a failed) call.

### 8. `delete-account`

Confirmed: the caller can only ever delete themselves. There is no body
parameter anywhere in the file that could name a different target user — the
only user id used anywhere in the function is `caller.userId`, sourced from
the verified JWT.

**Cascade/orphaning behavior — cross-checked against every FK referencing
`profiles(id)` in the schema** (`grep -n "references profiles(id)" supabase/migrations/*.sql`):

| Table.column                                                     | ON DELETE                                                 | In `delete-account`'s `nullableRefs`?                               | Outcome on self-delete                                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clubs.owner_id`                                                 | none (restrict)                                           | N/A — guarded structurally                                          | Function blocks deletion with 409 if caller still owns a club ([index.ts:24-33](supabase/functions/delete-account/index.ts#L24)), so this FK is never actually hit |
| `team_coaches.coach_id`                                          | `cascade` (`0001_init.sql:43`)                            | No — correctly not needed                                           | Coach's team assignments are deleted along with them; no orphan                                                                                                    |
| `players.parent_id`                                              | `set null` (`0001_init.sql:51`)                           | No — correctly not needed                                           | Player row survives, parent link cleared automatically by Postgres                                                                                                 |
| `announcements.author_id`                                        | none                                                      | Yes ([index.ts:39](supabase/functions/delete-account/index.ts#L39)) | Cleared explicitly before delete — correct                                                                                                                         |
| `events.created_by`                                              | none                                                      | Yes                                                                 | Cleared explicitly — correct                                                                                                                                       |
| `push_tokens.profile_id`/`user_id`                               | `cascade` (`0001_init.sql:104`, `0010:62`)                | No — correctly not needed                                           | Token rows deleted; no orphan                                                                                                                                      |
| `messages.sender_id`                                             | none                                                      | Yes                                                                 | Cleared explicitly — correct                                                                                                                                       |
| `evaluations.coach_id`                                           | none                                                      | Yes                                                                 | Cleared explicitly — correct                                                                                                                                       |
| `drills.added_by`                                                | none                                                      | Yes                                                                 | Cleared explicitly — correct                                                                                                                                       |
| `report_views.viewer_id`                                         | none                                                      | Yes                                                                 | Cleared explicitly — correct                                                                                                                                       |
| `consent_records.user_id`                                        | `cascade`, **not null** (`0009_legal_compliance.sql:11`)  | N/A                                                                 | **F8 — see below**                                                                                                                                                 |
| `parent_link_codes.created_by`                                   | `cascade`, **not null** (`0010_product_readiness.sql:49`) | N/A                                                                 | **F9 — see below**                                                                                                                                                 |
| `parent_link_codes.claimed_by`                                   | `set null` (`0010:51`)                                    | No — correctly not needed                                           | Cleared automatically                                                                                                                                              |
| `attendance_records.marked_by` / `development_plans.reviewed_by` | `set null` (`0010:37,14`)                                 | No — correctly not needed                                           | Cleared automatically                                                                                                                                              |
| `announcement_reads.user_id`                                     | `cascade` (`0012_announcement_reads.sql:8`)               | No — correctly not needed                                           | Read-receipt rows deleted; no meaningful loss                                                                                                                      |
| `player_payments.marked_by`                                      | **none** (`0025_player_payments.sql:14`)                  | **No — missing**                                                    | **F10 — see below**                                                                                                                                                |

**F8 (MEDIUM, compliance-relevant) — deleting an account cascades to delete that user's `consent_records`.**
`consent_records.user_id` is `not null references profiles(id) on delete cascade`
(`supabase/migrations/0009_legal_compliance.sql:11`). This table is the record
of a user having accepted terms/parental-data-consent
(`consent_type in ('terms_and_privacy', 'parental_data_consent')`, [0009:12](supabase/migrations/0009_legal_compliance.sql#L12)).
Self-deleting your account destroys the very record that would prove consent
was once given — the opposite of what's usually wanted for a legal/compliance
audit trail, where the ability to prove _"this person did consent, on this
date, to this policy version"_ is often expected to survive account deletion.
This is a judgment call for counsel, not a pure code bug — flagged here
because it's a real, citable behavior a reviewing attorney would want to know
about. **Needs clarification: should consent history be retained
(`on delete set null` + a separate immutable log, or similar) after a user
deletes their own account, for compliance-evidence purposes?**

**F9 (LOW) — `parent_link_codes` created by a director are destroyed if they delete their account.**
`created_by uuid not null references profiles(id) on delete cascade`
(`supabase/migrations/0010_product_readiness.sql:49`). An outstanding, unclaimed
invite code silently disappears if its creating director deletes their
account. Low impact (a parent with a dead code just needs a new one issued by
a remaining director), but worth noting alongside F8/F10 since it's the same
root cause: several `profiles`-referencing FKs added after the initial
`nullableRefs` list was written were never cross-checked against that list.

**F10 (MEDIUM, functional) — `player_payments.marked_by` has no `ON DELETE` behavior and is absent from `nullableRefs`, so `delete-account` will hard-fail for anyone who has ever marked a payment.**
`marked_by uuid references profiles(id)` (`supabase/migrations/0025_player_payments.sql:14`)
has no `ON DELETE` clause at all, meaning Postgres's default (`NO ACTION` /
effectively `RESTRICT`) applies. `delete-account`'s `nullableRefs` array
([index.ts:38-45](supabase/functions/delete-account/index.ts#L38)) does not include `["player_payments", "marked_by"]`. Any
coach or director who has ever marked a `player_payments` row (a routine,
expected action per `0025`'s own comment: "lets a director mark whether a
player's monthly training fee has been paid") will have `auth.admin.deleteUser()`
fail with a foreign-key-violation error when they try to delete their own
account — the request fails loudly (caught by the outer `try`/`errorResponse`),
so this is a blocked self-deletion, not silent data loss, but it means
`delete-account` is broken for a realistic subset of real users today.
**Fix:** add `["player_payments", "marked_by"]` to `nullableRefs`.

---

## Summary table

| #   | Finding                                                                                                                                | Severity                          | File:line                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | Stale `players.team_id → teams.club_id` tenancy join, superseded everywhere else by Phase 6a, still present in 2 of the 3 AI functions | HIGH                              | [generate-development-plan/index.ts:58-66](supabase/functions/generate-development-plan/index.ts#L58) (throws, denies legitimate teamless-client access); [director-copilot/index.ts:58-61](supabase/functions/director-copilot/index.ts#L58) (silently excludes teamless players from all aggregates) |
| F7  | No audit log of any AI call (club/user/timestamp/model/output)                                                                         | MEDIUM                            | absence confirmed across `supabase/migrations/*.sql`; closest tables are `supabase/migrations/0005_rate_limiting_and_audit.sql:10` and `:58`, neither of which fits                                                                                                                                    |
| F4  | Parsed Anthropic response written to `development_plans` with no schema/content validation                                             | MEDIUM                            | [generate-development-plan/index.ts:143,166-167](supabase/functions/generate-development-plan/index.ts#L143)                                                                                                                                                                                           |
| F2  | Coach-notes scrub only removes the current player's own name, not other PII                                                            | MEDIUM                            | [generate-development-plan/index.ts:89-101,110](supabase/functions/generate-development-plan/index.ts#L89)                                                                                                                                                                                             |
| F3  | Real coach names sent unanonymized to Anthropic                                                                                        | MEDIUM                            | [director-copilot/index.ts:135-144,154-162,183](supabase/functions/director-copilot/index.ts#L135)                                                                                                                                                                                                     |
| F8  | Account deletion cascades to delete that user's consent records                                                                        | MEDIUM (compliance judgment call) | `supabase/migrations/0009_legal_compliance.sql:11`                                                                                                                                                                                                                                                     |
| F10 | `player_payments.marked_by` missing from `delete-account`'s cleanup list; blocks self-deletion for anyone who's marked a payment       | MEDIUM (functional)               | `supabase/migrations/0025_player_payments.sql:14`; [delete-account/index.ts:38-45](supabase/functions/delete-account/index.ts#L38)                                                                                                                                                                     |
| F5  | `extract-voice-note` doesn't verify the model's returned `player_id` is a member of the roster it built                                | LOW                               | [extract-voice-note/index.ts:143-151](supabase/functions/extract-voice-note/index.ts#L143)                                                                                                                                                                                                             |
| F6  | No prompt-injection-specific input hardening in any of the three prompts                                                               | LOW                               | [generate-development-plan/index.ts:106-119](supabase/functions/generate-development-plan/index.ts#L106), [extract-voice-note/index.ts:97-121](supabase/functions/extract-voice-note/index.ts#L97), [director-copilot/index.ts:177-187](supabase/functions/director-copilot/index.ts#L177)             |
| F9  | Unclaimed `parent_link_codes` destroyed if the creating director deletes their account                                                 | LOW                               | `supabase/migrations/0010_product_readiness.sql:49`                                                                                                                                                                                                                                                    |

No CRITICAL findings. No instance of client-supplied tenancy being trusted
without server-side re-verification was found in any of the four functions.

---

## Autonomy & oversight

| Function                    | Current autonomy                                                                                                                                                                                                                                                                                                                     | What it should be                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generate-development-plan` | Human-in-the-loop — writes a `'draft'` row a coach/director must explicitly publish before a parent can see it (real, RLS-enforced gate; confirmed under check #5)                                                                                                                                                                   | Correct as-is. The one gap is upstream of autonomy: validate model output shape (F4) before even the draft is trustworthy for a human reviewer to approve quickly.                                                                                     |
| `extract-voice-note`        | Advisory-only from the function itself; the client adds a real human-in-the-loop step (per-item include/exclude review, [voice-evaluation.tsx:265-307](app/modals/voice-evaluation.tsx#L265)) before anything is written, and the actual skill values written are computed by deterministic client logic, not trusted from the model | Correct as-is. Consider having the function itself drop any `player_id` not in its own roster codebook (F5) as defense in depth, independent of the client's own checks.                                                                               |
| `director-copilot`          | Advisory-only — read-only, answers a director's question, no persistence                                                                                                                                                                                                                                                             | Correct as-is for the advisory use case. F3 (real coach names sent to the model) should be fixed regardless of autonomy level, since it's a data-handling issue, not a control issue.                                                                  |
| `delete-account`            | Full autonomy, scoped strictly to the caller's own account                                                                                                                                                                                                                                                                           | Correct scope. F10 is a completeness bug in the cleanup list, not an autonomy/authorization problem — fix by adding the missing FK to `nullableRefs`. F8 is a policy question for counsel about what should survive deletion, independent of autonomy. |

---

## Needs clarification

- **`evaluations` insert RLS policy** — `extract-voice-note`'s downstream
  write path (`voice-evaluation.tsx` → direct client insert into
  `evaluations`) relies on that table's own RLS insert policy to prevent a
  coach from writing an evaluation for a player outside their club/team. This
  audit's scope was the four edge functions plus code that invokes them; the
  `evaluations` insert policy itself was not independently re-verified in
  this pass. Given F5, this policy is the actual backstop against a
  hallucinated cross-tenant `player_id`, so it's worth confirming directly
  rather than assuming.
- **`check_rate_limit` correctness** — read in full
  (`supabase/migrations/0005_rate_limiting_and_audit.sql:24-48`) and appears
  correct (sliding window scoped by `p_user_id` + `function_name`, security
  definer, called with the service-role-only grant at [0005:50](supabase/migrations/0005_rate_limiting_and_audit.sql#L50)). Not flagged
  as a finding, but noting explicitly since Step 2 check #2 asked about it —
  this is a confirmation, not a guess.
- **Whether F8's cascade-delete of `consent_records` is acceptable** is a
  legal/compliance judgment call outside this audit's ability to answer from
  code alone — listed here rather than scored, per instruction.
