import React from "react";
import { View, ViewProps, StyleSheet } from "react-native";
import { Text, TextTone } from "./Text";
import { color, radius, space } from "@/theme";

export type BadgeTone = "brand" | "success" | "warning" | "danger" | "neutral";

export interface BadgeProps extends ViewProps {
  label: string;
  tone?: BadgeTone;
}

const BG: Record<BadgeTone, string> = {
  brand: color.bg.brandSubtle,
  success: color.bg.successSubtle,
  warning: color.bg.warningSubtle,
  danger: color.bg.dangerSubtle,
  neutral: color.bg.sunken,
};

const FG: Record<BadgeTone, TextTone> = {
  brand: "brand",
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "secondary",
};

export function Badge({ label, tone = "neutral", style, ...rest }: BadgeProps) {
  return (
    <View style={[styles.base, { backgroundColor: BG[tone] }, style]} {...rest}>
      <Text role="caption" tone={FG[tone]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    paddingVertical: space[1],
    paddingHorizontal: space[2],
    borderRadius: radius.chip,
  },
});
