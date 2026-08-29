import React from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { Text } from "./Text";
import { color, radius, space } from "@/theme";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.on : styles.off]}
    >
      <Text role="label" tone={selected ? "inverse" : "secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface FilterChipRowProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

/** Horizontally scrolling filter row — announcements, drill library. */
export function FilterChipRow({ options, value, onChange }: FilterChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((o) => (
        <Chip key={o} label={o} selected={o === value} onPress={() => onChange(o)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderRadius: radius.chip,
    borderWidth: 1,
  },
  on: { backgroundColor: color.bg.spotlight, borderColor: color.bg.spotlight },
  off: { backgroundColor: color.bg.surface, borderColor: color.border.subtle },
  row: { gap: space[2], paddingHorizontal: space[4] },
});
