# ClubHQ Data Retention and Deletion Policy

**Status:** Pre-launch operational policy for attorney review  
**Version:** 2026-09-04 draft  
**Owner:** SkarioX Automation LLC / ClubHQ

## Purpose

ClubHQ retains personal information only for a documented product, security, contractual, safety, or legal purpose. When that purpose ends, data should be deleted or de-identified on the schedule below unless an approved legal hold, safety investigation, contract requirement, insurance requirement, or other documented obligation requires temporary preservation.

These timeframes are operational baselines, not statements of a universal statutory retention period. Final production periods must be approved against applicable law, customer contracts, insurance requirements, vendor capabilities, and counsel guidance before broad public launch.

## Retention schedule

| Record category | Proposed operational window | End-of-window action |
| --- | --- | --- |
| Unverified signup/account | 7 to 30 days when verification or club approval is not completed | Delete account and associated personal data |
| Active player profile and development records | Active relationship plus 30 to 90 days | Delete or de-identify after the relationship/request lifecycle, subject to legal hold or contract |
| Messages | 12 to 24 months, with a shorter club-configurable period preferred where practical | Delete unless preserved for a documented safety investigation or legal hold |
| Voice transcript used for an evaluation | Through evaluation confirmation, then 0 to 30 days | Delete transcript after confirmation window |
| Raw voice audio | Do not retain by default | Process transiently and delete |
| AI prompt/output payloads at external vendors | Shortest vendor-supported period consistent with service operation | Expire/delete under vendor terms and DPA |
| Security/audit records | 12 to 24 months | Delete after security/accountability purpose ends unless held |
| Operational backups | Rolling 30 to 90 days | Age out through backup rotation; do not restore deleted data into active production except for disaster recovery |
| Consent evidence | Only as long as reasonably necessary to document acceptance, withdrawal, deletion handling, disputes, or another approved compliance purpose | Purge under the approved legal/compliance schedule; retain only minimized/pseudonymous evidence after live account/player deletion |

## Consent evidence minimization

Consent records must not be destroyed merely because the related adult account or player row is deleted. ClubHQ keeps the consent type, policy version, consent timestamp, withdrawal status/timestamp, and stable subject UUID references after the live foreign keys are removed.

The retained consent ledger must not copy a deleted user's name, email address, child name, profile photo, or other unnecessary profile fields. Stable UUID references are used only to preserve evidence and must themselves be purged when the approved consent-evidence retention purpose ends.

## User rights workflow

ClubHQ should provide authenticated adults with:

1. A portable export of personal data attributable to their account.
2. Access to correct ordinary profile information through normal product workflows.
3. Adult account deletion, subject to organization-ownership transfer requirements.
4. Parent-initiated deletion of a linked player's record when authorized.
5. Parental consent withdrawal that immediately ends the live parent-player link.

A consent withdrawal does not automatically delete the club's player record. A parent who wants both withdrawal and deletion should make the deletion request before unlinking, or use the documented support/request process afterward if applicable.

## Deletion handling

When an adult account is deleted:

- Personally attributable live references should be removed or nulled where the club needs to preserve non-personal operational history.
- Parent-child access links end.
- Active parental consent is recorded as withdrawn/ended.
- The Auth account and live profile are deleted.
- Minimized consent evidence survives according to the consent-evidence schedule rather than cascading away.

When a player record is deleted, player-scoped development records that cascade from that record should also be removed, while minimized consent evidence remains detached from the deleted live player row.

## Backups and downstream systems

Deletion from the active production database does not imply that every encrypted backup block is immediately rewritten. Deleted records should age out through the documented backup rotation and must not be intentionally restored to active production except when required for disaster recovery. If a disaster recovery restore reintroduces previously deleted data, the deletion queue/log should be reapplied before normal service resumes.

Third-party vendors must be configured, contractually required, or operationally handled to follow ClubHQ's approved deletion and retention instructions where applicable.

## Legal holds and safety preservation

A legal hold or documented safety investigation may suspend ordinary deletion for the minimum data reasonably necessary. Holds must have an owner, reason, scope, start date, and review/release process. A hold must not become an indefinite default retention rule.

## Review cadence

Review this policy before public launch, at least annually thereafter, and whenever ClubHQ materially changes data categories, AI/voice processing, child-data workflows, vendors, customer contracts, or applicable legal requirements.
