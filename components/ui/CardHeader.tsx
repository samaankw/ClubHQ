import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text, Eyebrow } from "./Text";
import { space } from "@/theme";

export interface CardHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
}

/**
 * Eyebrow on the left, a brand-tone text action on the right — the shape
 * Profile's coach-bio card hand-rolled and the pattern converted screens
 * converge on for a card's own header row (as opposed to Screen-level
 * section titles, which SectionHeader used to cover before it was removed
 * for clashing with this Eyebrow convention).
 */
export function CardHeader({ title, action, onAction }: CardHeaderProps) {
  return (
    <View style={styles.row}>
      <Eyebrow>{title}</Eyebrow>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          // The action is often a single glyph ("+"), which as a bare text
          // node is a ~7pt-wide touch target. hitSlop brings every caller up
          // to the 44pt minimum without changing the layout.
          hitSlop={space[3]}
          style={styles.action}
        >
          <Text role="label" tone="brand">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  action: { minWidth: space[6], alignItems: "flex-end", justifyContent: "center" },
});
