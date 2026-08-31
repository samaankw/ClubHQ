import React from "react";
import { View, ViewProps, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, radius, space } from "@/theme";

export type IconName = keyof typeof Ionicons.glyphMap;
export type ChipTone = "brand" | "success" | "warning" | "danger";

export interface IconChipProps extends ViewProps {
  name: IconName;
  tone?: ChipTone;
  size?: number;
}

const BG: Record<ChipTone, string> = {
  brand: color.bg.brandSubtle,
  success: color.bg.successSubtle,
  warning: color.bg.warningSubtle,
  danger: color.bg.dangerSubtle,
};

const FG: Record<ChipTone, string> = {
  brand: color.icon.brand,
  success: color.icon.success,
  warning: color.icon.warning,
  danger: color.icon.danger,
};

/** Tinted rounded square holding a colored glyph — used across every screen. */
export function IconChip({ name, tone = "brand", size = 18, style, ...rest }: IconChipProps) {
  return (
    <View style={[styles.base, { backgroundColor: BG[tone] }, style]} {...rest}>
      <Ionicons name={name} size={size} color={FG[tone]} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: space[8],
    height: space[8],
    borderRadius: radius.tile,
    alignItems: "center",
    justifyContent: "center",
  },
});
