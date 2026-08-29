import React from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";
import { Text, TextTone } from "./Text";
import { color, space, radius, borderWidth, opacity } from "@/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  left?: React.ReactNode;
}

const SURFACE: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: color.bg.brand },
  secondary: {
    backgroundColor: color.bg.surface,
    borderWidth: borderWidth.thin,
    borderColor: color.border.subtle,
  },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: color.bg.dangerSubtle },
};

const TONE: Record<ButtonVariant, TextTone> = {
  primary: "inverse",
  secondary: "primary",
  ghost: "brand",
  danger: "danger",
};

const PAD: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number }> = {
  sm: { paddingVertical: space[2], paddingHorizontal: space[3] },
  md: { paddingVertical: space[3], paddingHorizontal: space[4] },
  lg: { paddingVertical: space[4], paddingHorizontal: space[5] },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  fullWidth,
  disabled,
  left,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        PAD[size],
        SURFACE[variant],
        fullWidth && styles.fullWidth,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      {left}
      <Text role="h3" tone={TONE[variant]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    borderRadius: radius.button,
  },
  fullWidth: { alignSelf: "stretch" },
  dimmed: { opacity: opacity.pressed },
});
