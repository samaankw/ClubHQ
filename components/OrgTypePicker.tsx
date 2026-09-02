import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { OrgType } from "@/types/db";
import { Text } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

// small_club and large_club currently produce identical wording everywhere
// in lib/vocab.ts -- nothing distinguishes them yet, so offering "Small
// Club" vs "Large Club" here would be a choice with no actual consequence
// today. "Club" maps to small_club, matching the column's existing default;
// split this into its own option if a real large-club-specific feature ever
// gets built.
const OPTIONS: { value: OrgType; label: string; description: string }[] = [
  {
    value: "private_trainer",
    label: "Private Trainer",
    description: "Just you, training clients one-on-one or in small groups. No standing teams or rosters.",
  },
  {
    value: "academy",
    label: "Academy",
    description:
      "Structured training groups by age or skill level — athletes train together, but you're not running organized league games.",
  },
  { value: "small_club", label: "Club", description: "Teams, rosters, and a full season — the traditional club setup." },
];

interface Props {
  value: OrgType;
  onChange: (value: OrgType) => void;
}

export default function OrgTypePicker({ value, onChange }: Props) {
  return (
    <View style={{ gap: space[2] }}>
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={selected ? color.icon.brand : color.icon.muted}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text role="h3">{option.label}</Text>
              <Text tone="secondary" role="bodySm">
                {option.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    gap: space[3],
    alignItems: "flex-start",
    padding: space[3],
    borderRadius: radius.card,
    borderWidth: borderWidth.thin,
    borderColor: color.border.subtle,
  },
  optionSelected: { borderColor: color.border.brand, backgroundColor: color.bg.brandSubtle },
});
