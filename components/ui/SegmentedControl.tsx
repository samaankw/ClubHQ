import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "./Text";
import { color, radius, space } from "@/theme";

export interface SegmentedControlProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

/** Two-up switch — Events / Announcements on the Schedule tab. */
export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <View style={styles.track}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="button"
            accessibilityLabel={o}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o)}
            style={[styles.segment, active && styles.active]}
          >
            <Text role="h3" tone={active ? "brand" : "secondary"}>
              {o}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: color.bg.sunken,
    borderRadius: radius.md,
    padding: space[1],
    gap: space[1],
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space[2],
    borderRadius: radius.sm,
  },
  active: { backgroundColor: color.bg.surface },
});
