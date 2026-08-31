import React from "react";
import { View, ViewStyle, StyleProp, StyleSheet } from "react-native";
import { color, radius, space } from "@/theme";

export interface StepDotsProps {
  count: number;
  /** 0-based index of the current step. */
  active: number;
  style?: StyleProp<ViewStyle>;
}

/** Decorative onboarding progress bars. Purely visual — hidden from a11y. */
export function StepDots({ count, active, style }: StepDotsProps) {
  return (
    <View
      testID="step-dots"
      style={[styles.row, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          testID="step-dot"
          style={[styles.dot, { backgroundColor: i === active ? color.bg.brand : color.border.subtle }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", gap: space[2] },
  dot: { width: space[6], height: space[1], borderRadius: radius.full },
});
