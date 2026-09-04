import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { Text } from "@/components/ui";
import { color, radius, space, type as typeTokens } from "@/theme";

const UPDATED = "September 4, 2026";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const configuredContact = String(process.env.EXPO_PUBLIC_LEGAL_CONTACT_EMAIL || Constants.expoConfig?.extra?.legalContactEmail || "");
  const contact =
    configuredContact && !configuredContact.includes("LEGAL_CONTACT_EMAIL_HERE")
      ? configuredContact
      : "[LEGAL CONTACT EMAIL MUST BE CONFIGURED BEFORE LAUNCH]";
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.draftBanner}>
        <Text role="bodySm" tone="warning" style={styles.draftText}>
          DRAFT FOR ATTORNEY REVIEW BEFORE PUBLIC LAUNCH. This product copy is not a legal opinion or compliance certification.
        </Text>
      </View>
      <Text role="h1" style={styles.h1}>
        {title}
      </Text>
      <Text role="caption" tone="tertiary" style={styles.updated}>
        Last updated: {UPDATED}
      </Text>
      {children}
      <Text role="h2" tone="brand" style={styles.h2}>
        Contact
      </Text>
      <Text tone="secondary" style={styles.p}>
        Privacy, deletion, or legal questions: {contact}
      </Text>
    </ScrollView>
  );
}

export function TermsContent() {
  return (
    <Shell title="ClubHQ Terms of Service">
      <Text role="h2" tone="brand" style={styles.h2}>
        Adult accounts only
      </Text>
      <Text tone="secondary" style={styles.p}>
        ClubHQ accounts in this build are for adult club directors, coaches, and parents/guardians. Players are managed as club records and
        do not create login credentials.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Club responsibilities
      </Text>
      <Text tone="secondary" style={styles.p}>
        Clubs are responsible for adding authorized staff, maintaining accurate rosters, using appropriate player information, and obtaining
        any permissions required for their organization. Directors control team and roster administration.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        AI-assisted coaching features
      </Text>
      <Text tone="secondary" style={styles.p}>
        AI may help turn coach evaluations into draft development plans and summarize club development information. New development plans
        are drafts until an authorized coach or director reviews and publishes them. AI output is a coaching aid and is not medical,
        diagnostic, or professional health advice.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Acceptable use
      </Text>
      <Text tone="secondary" style={styles.p}>
        Users may not attempt to access another club's data, impersonate another person, abuse messaging, bypass permissions, reverse
        engineer protected services, or use ClubHQ for unlawful activity.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Account and data removal
      </Text>
      <Text tone="secondary" style={styles.p}>
        Adult users can request account deletion from Profile. Linked parents and club directors can permanently delete a player's ClubHQ
        record and its related development history from the player profile. Some club records may need to be reassigned or removed before an
        adult account can be deleted. Minimized consent evidence may be retained after deletion only under ClubHQ's approved retention and
        legal-hold process.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Launch notice
      </Text>
      <Text tone="secondary" style={styles.p}>
        Commercial terms, warranty language, limitation of liability, governing law, dispute terms, subscription terms, and
        organization-specific obligations must be finalized with qualified counsel before this draft is used as production legal terms.
      </Text>
    </Shell>
  );
}

export function PrivacyPolicyContent() {
  return (
    <Shell title="ClubHQ Privacy Policy">
      <Text role="h2" tone="brand" style={styles.h2}>
        Who this covers
      </Text>
      <Text tone="secondary" style={styles.p}>
        ClubHQ is designed around adult users. A player is a development record linked to a club and, when applicable, a team and a
        parent/guardian account. The current product does not require a child to create an account.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Information the app can store
      </Text>
      <Text tone="secondary" style={styles.p}>
        Adult account data can include name, email, role, club membership, messages, and app activity. Player records can include name,
        club, optional team, optional birth date, position, optional photo URL, evaluations, coach notes, development plans, homework
        completion, RSVP status, attendance, and report-view activity.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Parent-player linking and consent
      </Text>
      <Text tone="secondary" style={styles.p}>
        A club director generates a one-time player link code. A parent who claims that code must explicitly confirm parental/guardian
        authority and consent before ClubHQ links that specific player to the parent's account. Club membership by itself does not give a
        parent access to the whole roster. A linked parent can withdraw parental consent from Privacy & Data, which removes the live
        parent-player link and ends that parent's access to the player's development data.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Who can see player data
      </Text>
      <Text tone="secondary" style={styles.p}>
        Row Level Security limits player and evaluation access to authorized club staff and the player's linked parent. Parents can see
        published development plans for their linked child, while draft plans remain visible only to staff for review.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Your privacy controls
      </Text>
      <Text tone="secondary" style={styles.p}>
        Authenticated adults can use Privacy & Data to export a portable copy of account data attributable to them. Parent exports include
        records for children who are currently linked to that parent. Adult account deletion is available from Profile, and an authorized
        linked parent or club director can permanently delete a player's ClubHQ record through the player profile.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        AI processing
      </Text>
      <Text tone="secondary" style={styles.p}>
        ClubHQ uses server-side AI features for development-plan generation, structured voice-note analysis, and director insights. The code
        minimizes direct identity sharing where practical, including anonymizing player names in AI prompts. Speech recognition for coach
        voice evaluation is configured through the device speech-recognition integration; the resulting transcript is sent only when the
        coach submits it for analysis.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Notifications
      </Text>
      <Text tone="secondary" style={styles.p}>
        If a user grants notification permission and the production EAS project is configured, ClubHQ can register a push token tied to that
        adult account. Notification delivery rules still require production server configuration.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Deletion and retention
      </Text>
      <Text tone="secondary" style={styles.p}>
        ClubHQ's pre-launch operational retention schedule uses limited windows by record type. Proposed baselines include 7 to 30 days for
        incomplete signups, an active player relationship plus 30 to 90 days for player/development records, 12 to 24 months or a shorter
        configured period for messages, 0 to 30 days after evaluation confirmation for voice transcripts, 12 to 24 months for security/audit
        records, and a rolling 30 to 90 days for operational backups. Raw coach voice audio is not retained by default. These are operational
        baselines for attorney review, not universal statutory deadlines, and may be shortened or temporarily extended for an approved legal
        hold, safety investigation, contract, insurance requirement, or other documented obligation.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Consent evidence after deletion
      </Text>
      <Text tone="secondary" style={styles.p}>
        Deleting an adult account or player record does not automatically erase the evidence that consent was previously accepted or later
        withdrawn. ClubHQ can retain a minimized consent record containing the consent type, policy version, timestamps, status, and stable
        subject identifiers for only as long as reasonably necessary under the approved retention or legal-hold schedule. The retained
        consent ledger is designed not to copy deleted profile names, email addresses, child names, or profile photos.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Security
      </Text>
      <Text tone="secondary" style={styles.p}>
        The application uses authenticated Supabase access, Row Level Security, server-authorized RPCs, encrypted local session storage,
        role checks, and rate limiting around AI functions. No security control eliminates all risk, so production monitoring, backups,
        incident-response procedures, and independent security testing remain operational requirements.
      </Text>

      <Text role="h2" tone="brand" style={styles.h2}>
        Children's privacy notice
      </Text>
      <Text tone="secondary" style={styles.p}>
        This draft is technical product copy, not a determination that ClubHQ satisfies COPPA or any state, school, league, or international
        privacy regime. A qualified attorney should review the final data flows, parental-consent method, retention policy, vendor terms,
        export/deletion workflows, and notices before launch.
      </Text>
    </Shell>
  );
}

export function LegalTermsContent() {
  return <TermsContent />;
}

// The draft banner deliberately keeps a warning tone because it is a legal
// notice, not decoration, so it uses the warning tokens rather than blending in.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg.surface, padding: space[5] },
  draftBanner: {
    backgroundColor: color.bg.warningSubtle,
    borderRadius: radius.md,
    padding: space[3],
    marginBottom: space[5],
  },
  draftText: { textAlign: "center" },
  h1: { marginBottom: space[1] },
  updated: { marginBottom: space[5] },
  h2: { marginTop: space[5], marginBottom: space[2] },
  p: { lineHeight: typeTokens.body.lineHeight },
});
