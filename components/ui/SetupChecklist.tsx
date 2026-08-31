import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { Text, Eyebrow } from "./Text";
import { IconChip, IconName } from "./IconChip";
import { SetupStep } from "@/lib/hooks";
import { color, radius, space, opacity } from "@/theme";

export interface SetupChecklistProps {
  steps: SetupStep[];
  completed: number;
  total: number;
  onStepPress: (step: SetupStep) => void;
}

// The hook only knows what's done, not how to draw it — the checklist owns
// the per-step glyph so `SetupStep` can stay a plain data shape.
const ICONS: Record<SetupStep["key"], IconName> = {
  club: "business",
  team: "people",
  players: "person-add",
  practice: "calendar",
};

/**
 * One next action at a time. The first incomplete step is the only
 * pressable row — later incomplete steps are shown (so the coach can see
 * what's coming) but dimmed and inert, since surfacing four competing calls
 * to action is the exact problem this component exists to avoid.
 */
export function SetupChecklist({ steps, completed, total, onStepPress }: SetupChecklistProps) {
  const firstIncompleteIndex = steps.findIndex((s) => !s.done);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Eyebrow tone="brand">Getting Started</Eyebrow>
        <Text role="label" tone="secondary">
          {completed}/{total} Complete
        </Text>
      </View>

      <View style={styles.rows}>
        {steps.map((step, index) => {
          if (step.done) {
            const label = `${step.title}, complete${step.detail ? `. ${step.detail}` : ""}`;
            return (
              <View key={step.key} style={styles.row} accessible accessibilityLabel={label}>
                <View style={styles.checkCircle}>
                  <Ionicons name="checkmark" size={14} color={color.icon.inverse} />
                </View>
                <View style={styles.text}>
                  <Text role="h3">{step.title}</Text>
                  {step.detail ? (
                    <Text role="bodySm" tone="tertiary">
                      {step.detail}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }

          if (index === firstIncompleteIndex) {
            return (
              <Pressable
                key={step.key}
                accessibilityRole="button"
                accessibilityLabel={`${step.title}. Recommended next step`}
                onPress={() => onStepPress(step)}
                style={styles.row}
              >
                <IconChip name={ICONS[step.key]} tone="brand" />
                <View style={styles.text}>
                  <Text role="h3">{step.title}</Text>
                  <Text role="bodySm" tone="brand">
                    Recommended next step
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={color.icon.muted} />
              </Pressable>
            );
          }

          return (
            <View key={step.key} style={[styles.row, styles.disabledRow]}>
              <IconChip name={ICONS[step.key]} tone="brand" />
              <View style={styles.text}>
                <Text role="h3">{step.title}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rows: { gap: space[1] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[2] },
  disabledRow: { opacity: opacity.disabled },
  text: { flex: 1, gap: space[1] },
  checkCircle: {
    width: space[8],
    height: space[8],
    borderRadius: radius.full,
    backgroundColor: color.icon.success,
    alignItems: "center",
    justifyContent: "center",
  },
});
