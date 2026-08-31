import React from "react";
import { View, StyleSheet } from "react-native";
import { color, radius, space } from "@/theme";

export interface ProgressBarProps {
  /** 0–1. Values outside the range are clamped. */
  value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={styles.track}>
      <View testID="progress-fill" style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: space[2],
    backgroundColor: color.bg.sunken,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: color.bg.brand, borderRadius: radius.full },
});
