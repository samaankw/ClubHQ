import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { Text } from "@/components/ui";
import { color, radius, space, type as typeTokens } from "@/theme";

const UPDATED = "August 15, 2026";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const configuredContact = String(process.env.EXPO_PUBLIC_LEGAL_CONTACT_EMAIL || Constants.expoConfig?.extra?.legalContactEmail || "");
  const contact = configuredContact && !configuredContact.includes("LEGAL_CONTACT_EMAIL_HERE") ? configuredContact : "[LEGAL CONTACT EMAIL MUST BE CONFIGURED BEFORE LAUNCH]";
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.draftBanner}><Text role="bodySm" tone="warning" style={styles.draftText}>DRAFT FOR ATTORNEY REVIEW BEFORE PUBLIC LAUNCH. This product copy is not a legal opinion or compliance certification.</Text></View>
      <Text role="h1" style={styles.h1}>{title}</Text>
      <Text role="caption" tone="tertiary" style={styles.updated}>Last updated: {UPDATED}</Text>
      {children}
      <Text role="h2" tone="brand" style={styles.h2}>Contact</Text>
      <Text tone="secondary" style={styles.p}>Privacy, deletion, or legal questions: {contact}</Text>
    </ScrollView>
  );
}

export function TermsContent() {
  return (
    <Shell title="ClubHQ Terms of Service">
      <Text role="h2" tone="brand" style={styles.h2}>Adult accounts only</Text>
      <Text tone="secondary" style={styles.p}>ClubHQ accounts in this build are for adult club directors, coaches, and parents/guardians. Players are managed as club records and do not create login credentials.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Club responsibilities</Text>
      <Text tone="secondary" style={styles.p}>Clubs are responsible for adding authorized staff, maintaining accurate rosters, using appropriate player information, and obtaining any permissions required for their organization. Directors control team and roster administration.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>AI-assisted coaching features</Text>
      <Text tone="secondary" style={styles.p}>AI may help turn coach evaluations into draft development plans and summarize club development information. New development plans are drafts until an authorized coach or director reviews and publishes them. AI output is a coaching aid and is not medical, diagnostic, or professional health advice.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Acceptable use</Text>
      <Text tone="secondary" style={styles.p}>Users may not attempt to access another club's data, impersonate another person, abuse messaging, bypass permissions, reverse engineer protected services, or use ClubHQ for unlawful activity.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Account and data removal</Text>
      <Text tone="secondary" style={styles.p}>Adult users can request account deletion from Profile. Linked parents and club directors can permanently delete a player's ClubHQ record and its related development history from the player profile. Some club records may need to be reassigned or removed before an adult account can be deleted.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Launch notice</Text>
      <Text tone="secondary" style={styles.p}>Commercial terms, warranty language, limitation of liability, governing law, dispute terms, subscription terms, and organization-specific obligations must be finalized with qualified counsel before this draft is used as production legal terms.</Text>
    </Shell>
  );
}

export function PrivacyPolicyContent() {
  return (
    <Shell title="ClubHQ Privacy Policy">
      <Text role="h2" tone="brand" style={styles.h2}>Who this covers</Text>
      <Text tone="secondary" style={styles.p}>ClubHQ is designed around adult users. A player is a development record linked to a team and, when applicable, a parent/guardian account. The current product does not require a child to create an account.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Information the app can store</Text>
      <Text tone="secondary" style={styles.p}>Adult account data can include name, email, role, club membership, messages, and app activity. Player records can include name, team, optional birth date, position, optional photo URL, evaluations, coach notes, development plans, homework completion, RSVP status, attendance, and report-view activity.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Parent-player linking and consent</Text>
      <Text tone="secondary" style={styles.p}>A club director generates a one-time player link code. A parent who claims that code must explicitly confirm parental/guardian authority and consent before ClubHQ links that specific player to the parent's account. Club membership by itself does not give a parent access to the whole roster.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Who can see player data</Text>
      <Text tone="secondary" style={styles.p}>Row Level Security limits player and evaluation access to authorized club staff and the player's linked parent. Parents can see published development plans for their linked child, while draft plans remain visible only to staff for review.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>AI processing</Text>
      <Text tone="secondary" style={styles.p}>ClubHQ uses server-side AI features for development-plan generation, structured voice-note analysis, and director insights. The code minimizes direct identity sharing where practical, including anonymizing player names in AI prompts. Speech recognition for coach voice evaluation is configured through the device speech-recognition integration; the resulting transcript is sent only when the coach submits it for analysis.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Notifications</Text>
      <Text tone="secondary" style={styles.p}>If a user grants notification permission and the production EAS project is configured, ClubHQ can register a push token tied to that adult account. Notification delivery rules still require production server configuration.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Deletion and retention</Text>
      <Text tone="secondary" style={styles.p}>Linked parents and directors can permanently delete a player's record and related development history in the app. Adult users can request account deletion. Before public launch, the business must adopt and document a specific retention schedule for records that are no longer needed rather than relying on indefinite storage.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Security</Text>
      <Text tone="secondary" style={styles.p}>The application uses authenticated Supabase access, Row Level Security, server-authorized RPCs, encrypted local session storage, role checks, and rate limiting around AI functions. No security control eliminates all risk, so production monitoring, backups, incident-response procedures, and independent security testing remain operational requirements.</Text>

      <Text role="h2" tone="brand" style={styles.h2}>Children's privacy notice</Text>
      <Text tone="secondary" style={styles.p}>This draft is technical product copy, not a determination that ClubHQ satisfies COPPA or any state, school, league, or international privacy regime. A qualified attorney should review the final data flows, parental-consent method, retention policy, vendor terms, and notices before launch.</Text>
    </Shell>
  );
}

export function LegalTermsContent() {
  return <TermsContent />;
}

// The draft banner deliberately keeps a warning tone — it is a legal notice,
// not decoration, so it uses the warning tokens rather than blending in.
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
