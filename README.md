# ClubHQ v0.2 Product-Readiness Build

ClubHQ is a youth-soccer club platform centered on coach-led player development. Adult directors, coaches, and parents use the app; players are managed as records rather than login accounts.

This package upgrades the original prototype into a more complete club-operations build around the existing evaluation → AI draft plan → homework → progress loop.

## What changed in this build

### Platform/runtime
- Expo SDK 57 / React Native 0.86 / React 19.2
- New Architecture enabled
- Replaced the archived `@react-native-voice/voice` dependency with `expo-speech-recognition`
- Added `expo-dev-client`, `expo-notifications`, EAS build profiles, `.gitignore`, and a static project verifier
- Session persistence stays in `expo-secure-store` using chunked secure values

### Director operations
- New **Club Management** screen
- Create and archive teams
- Add and archive players
- Assign/unassign coaches to teams
- Generate one-time parent/player link codes
- Club invite code remains separate from player-specific linking

### Parent/player privacy
- Parents no longer inherit read access to every player/evaluation in their club
- A parent sees only players specifically linked to that parent
- One-time player linking records player-specific parental/guardian consent
- Draft AI development plans are hidden from parents until staff publication
- Team announcements/events are restricted to the parent's linked child's team plus club-wide items

### AI development workflow
- New development plans default to `draft`
- Coach/director review controls whether a plan becomes `coach_reviewed` or `published`
- Player profile shows evaluation-history trend bars
- AI disclosure now makes the draft/review boundary explicit
- Existing plans are migrated to `published` so historical reports do not disappear during upgrade

### Schedule operations
- Events can be club-wide or team-specific
- Coaches can create events only for teams they are assigned to
- Event detail screen includes player RSVP
- Staff can record attendance (`present`, `late`, `absent`, `excused`)
- Directors get availability counts for each event

### Parent UX
- Multi-child dashboard selector
- Link-a-player flow from Profile
- RSVP for each linked child
- Homework completion remains parent-controlled

### Authentication/account
- Public legal pages no longer get trapped behind the signed-out redirect
- Forgot-password and update-password routes added
- Supabase reset links can return through the `clubhq://` app scheme
- Adult account deletion Edge Function added
- Account deletion preserves historical club content by clearing adult attribution where appropriate before deleting the Auth user

### Legal/privacy product plumbing
- Separate **Terms of Service** and **Privacy Policy** screens
- Signup consent is recorded only from an explicit signup checkbox, not inferred later from sign-in
- Player-specific parental consent is recorded when a parent claims a player link code
- Legal copy accurately reflects optional player DOB/photo fields and the staff-review AI workflow
- Legal text remains intentionally labeled as a draft for attorney review

### Push notification foundation
- Push-token table and Row Level Security
- Permission/token registration after sign-in when a real EAS project ID is configured
- Server-side notification delivery rules are not included yet; see "Still required before public launch"

## Main routes

```text
app/
├── (auth)/
│   ├── login.tsx
│   ├── signup.tsx
│   ├── reset-password.tsx
│   ├── update-password.tsx
│   ├── legal-terms.tsx
│   └── privacy.tsx
├── (tabs)/
│   ├── dashboard.tsx
│   ├── schedule.tsx
│   ├── announcements.tsx
│   ├── messages.tsx
│   ├── players.tsx
│   ├── copilot.tsx
│   └── profile.tsx
├── club-management.tsx
├── claim-player.tsx
├── event/[id].tsx
├── player/[id].tsx
└── modals/
```

## Database migration added

Apply migrations in order through:

```text
supabase/migrations/0010_product_readiness.sql
```

Migration `0010` adds:
- archived teams/players
- plan review/publication status
- attendance
- richer homework fields
- parent link codes
- player-specific consent reference
- push tokens
- tighter parent RLS
- event/RSVP/attendance policies
- coach assignment RPC
- player-link RPCs
- development-plan review RPC
- explicit signup-consent capture in the auth-user trigger

Do **not** copy isolated SQL snippets out of the migration and apply them out of order. The migration relies on helpers/functions created by earlier migrations.

## Edge Functions

Deploy the existing functions plus the new deletion function:

```bash
supabase functions deploy generate-development-plan
supabase functions deploy extract-voice-note
supabase functions deploy director-copilot
supabase functions deploy delete-account
```

Set the AI provider secret required by the existing AI functions in Supabase secrets. Never put service-role or AI-provider secret keys in the mobile `.env` file.

## Local configuration

Copy the environment template:

```bash
cp .env.example .env
```

Fill in:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
EXPO_PUBLIC_EAS_PROJECT_ID=YOUR_EAS_PROJECT_ID
EXPO_PUBLIC_LEGAL_CONTACT_EMAIL=privacy@yourdomain.example
```

The anon key is intended for client use with RLS. The Supabase **service-role key must remain server-side only**.

## Supabase Auth configuration

For password recovery/deep links, add your production callback URLs to the Supabase Auth redirect allow-list. For a development build using this package's scheme, include the appropriate `clubhq://...` redirect pattern used by your environment.

Also decide and configure before launch:
- email confirmation requirement
- password policy
- SMTP/from-address
- production site URL
- allowed redirect URLs
- abuse/rate limits

## Install and run

Use Node 22.13+.

```bash
npm install
npm run verify:static
npm run typecheck
npx expo-doctor@latest
npx expo prebuild --clean
npx expo run:ios
# or
npx expo run:android
```

Voice evaluation and remote push-notification testing should be done with a development build rather than treating Expo Go as the production test environment.

### Lockfile note

This archive does not fabricate a `package-lock.json`. The build environment used to prepare this ZIP could not reach the npm registry long enough to resolve the full dependency graph. On the first registry-connected install, run `npm install`, review the generated lockfile, run the verification commands above, and commit that lockfile before handing the project to another developer or buyer.

## Verification included in this package

The package contains `scripts/project-check.mjs`. Run:

```bash
npm run verify:static
```

It checks required product-readiness files, confirms the SDK 57 dependency is configured, confirms `expo-speech-recognition` is present, and scans source imports for the deprecated voice library.

Before packaging this build, all TS/TSX files were also passed through the TypeScript parser for syntax validation. A full dependency-aware typecheck/native build still requires `npm install` on a machine with registry access.

## Still required before public/commercial launch

These are intentionally not represented as "done" just because code exists:

1. **Attorney review.** Finalize Terms, Privacy Policy, children's-privacy/parental-consent approach, retention schedule, vendor disclosures, state-law considerations, and commercial terms.
2. **Production push delivery.** Token registration exists, but server-side notification fan-out and notification preferences still need to be designed and deployed.
3. **Email/deep-link testing.** Test confirmation, expired reset links, wrong-email recovery, and iOS/Android deep links against the real Supabase project.
4. **Dependency/native verification.** Generate and commit the npm lockfile, run Expo Doctor, clean prebuild, iOS/Android builds, and device smoke tests.
5. **Automated live-backend tests.** Add integration tests against a local/staging Supabase instance for cross-club isolation, parent isolation, role escalation, messaging authorization, deletion, RSVP, and consent flows.
6. **Monitoring.** Add crash/error monitoring and production analytics appropriate to the privacy policy.
7. **Notification/content moderation policy.** If richer media or expanded messaging is introduced, add the matching moderation/reporting controls and consent rules.
8. **Retention automation.** The schema supports deletion, but an organization-wide scheduled retention/deletion policy is still an operational decision and should be automated after counsel sets the periods.
9. **Independent security test.** Test the deployed app and Supabase project, not only the source code, before broad rollout.

## Recommended pilot flow

```text
Director creates club
        ↓
Director creates team(s)
        ↓
Adults join with club invite code
        ↓
Director assigns coaches
        ↓
Director adds players
        ↓
Director shares player-specific parent codes
        ↓
Parent claims child + confirms consent
        ↓
Coach evaluates player
        ↓
AI creates DRAFT plan
        ↓
Coach reviews / publishes
        ↓
Parent sees report + homework
        ↓
Parent RSVPs / logs homework
        ↓
Staff records attendance + reevaluates
        ↓
ClubHQ shows development trend
```

That flow is the intended product story for this version.
