import React from "react";
import { View, StyleSheet } from "react-native";
import { Card } from "./Card";
import { Text, Eyebrow, TextTone } from "./Text";
import { IconChip, IconName } from "./IconChip";
import { space } from "@/theme";

export interface StatTileProps {
  label: string;
  value: string;
  tone?: TextTone;
  icon?: IconName;
  footnote?: string;
}

/** Label-over-big-number tile. Two per row across the mockups. */
export function StatTile({ label, value, tone = "primary", icon, footnote }: StatTileProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        {icon ? <IconChip name={icon} size={14} /> : null}
        <Eyebrow>{label}</Eyebrow>
      </View>
      <Text role="display" tone={tone}>
        {value}
      </Text>
      {footnote ? (
        <Text role="caption" tone="tertiary">
          {footnote}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: space[1] },
  head: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
