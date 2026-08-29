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
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: color.bg.brand, false: color.bg.sunken }}
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
