import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { computeCopilotInsight, CopilotSnapshot, InsightTone } from "@/lib/copilotInsight";
import { copilotIdentity } from "@/lib/copilotScope";
import { Card, CardHeader, Text, IconChip, ListRow, Divider } from "@/components/ui";
import type { ChipTone, IconName } from "@/components/ui";
import { space } from "@/theme";

const TONE_ICON: Record<InsightTone, IconName> = {
  warning: "alert-circle",
  success: "checkmark-circle",
  neutral: "information-circle",
};

// InsightTone has no "danger" case by design — nothing the Copilot notices on
// a dashboard is an emergency, and a red card every time a coach is a week
// behind would train directors to ignore it.
const TONE_CHIP: Record<InsightTone, ChipTone> = {
  warning: "warning",
  success: "success",
  neutral: "brand",
};

export interface CopilotCardProps {
  /** Null for parents and players, who never see the Copilot. */
  snapshot: CopilotSnapshot | null;
  loading: boolean;
}

/** Opens the Copilot, optionally with a question already asked. */
function openCopilot(question?: string) {
  router.push(
    question
      ? ({ pathname: "/(tabs)/copilot", params: { q: question } } as never)
      : ("/(tabs)/copilot" as never)
  );
}

/**
 * The Copilot's entry point on Home, for directors and coaches only.
 *
 * Deliberately NOT the chat itself. A text input on a dashboard asks the user
 * to stop and invent a question, which is the reliable way to get an AI
 * feature ignored — a director opens Home to find out whether anything is
 * wrong, not to compose a query. So the card leads with a finding the app
 * computed itself, and every row on it opens the chat with a real question
 * already in flight.
 *
 * Renders for any director or coach even when there is no finding yet (a club
 * with no players, or a coach with no teams assigned), because this is now the
 * only way into the Copilot and a role that has access must always have a door.
 *
 * The snapshot is passed in rather than fetched here so the dashboard's
 * pull-to-refresh can re-run it with everything else on the screen — a card
 * that owned its own query would keep showing a stale finding after a pull.
 */
export default function CopilotCard({ snapshot, loading }: CopilotCardProps) {
  if (loading || !snapshot) return null;

  const identity = copilotIdentity(snapshot.role);
  const insight = computeCopilotInsight(snapshot);

  // Never offer the question the insight is already answering.
  const suggestions = identity.suggestions
    .filter((s) => s.text !== insight?.question)
    .slice(0, 2);

  return (
    <Card style={styles.card}>
      <CardHeader title={identity.title} action="Open" onAction={() => openCopilot()} />

      {insight ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${insight.headline}. Ask the Copilot.`}
          onPress={() => openCopilot(insight.question)}
          style={styles.insight}
        >
          <IconChip name={TONE_ICON[insight.tone]} tone={TONE_CHIP[insight.tone]} />
          <View style={styles.insightText}>
            <Text role="h3">{insight.headline}</Text>
            <Text role="bodySm" tone="secondary">
              {insight.detail}
            </Text>
          </View>
        </Pressable>
      ) : (
        <Text tone="secondary">{identity.scopeLine}</Text>
      )}

      <Divider />

      {suggestions.map((s) => (
        <ListRow key={s.text} icon={s.icon} title={s.text} onPress={() => openCopilot(s.text)} />
      ))}

      {/* Pilot metrics used to sit next to the Copilot on Profile, and the
          feedback treated them as one thing — they answer the same question
          ("what is happening across my club?") at different depths. Keeping
          them adjacent here preserves that pairing without sending a director
          back to an account screen to find either one. */}
      {snapshot.role === "director" && (
        <ListRow
          icon="stats-chart"
          title="Full pilot metrics"
          onPress={() => router.push("/pilot-metrics")}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  insight: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  insightText: { flex: 1, gap: space[1] },
});
