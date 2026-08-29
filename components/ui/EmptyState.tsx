import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Text";
import { IconChip, IconName } from "./IconChip";
import { space } from "@/theme";

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  body?: string;
}

export function EmptyState({ icon, title, body }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {icon ? <IconChip name={icon} /> : null}
      <Text role="h2">{title}</Text>
      {body ? (
        <Text role="bodySm" tone="secondary" style={styles.center}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: space[2], paddingVertical: space[7] },
  center: { textAlign: "center" },
});
