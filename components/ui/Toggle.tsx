import React from "react";
import { View, Switch, StyleSheet } from "react-native";
import { Text } from "./Text";
import { color, space } from "@/theme";

export interface ToggleProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function Toggle({ label, value, onValueChange }: ToggleProps) {
  return (
    <View style={styles.row}>
      <Text role="h3">{label}</Text>
      {/* iOS-style: a white thumb on a coloured track. Without an explicit
          thumbColor, React Native falls back to its own green thumb on Android
          and web, which reads as a second accent colour the design never
          chose. ios_backgroundColor sets the off-state track on iOS, where
          trackColor.false only applies while the switch is animating. */}
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: color.bg.brand, false: color.border.subtle }}
        thumbColor={color.bg.surface}
        ios_backgroundColor={color.border.subtle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space[3],
  },
});
