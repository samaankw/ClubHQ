import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { IconChip, IconName } from "./IconChip";
import { color, space } from "@/theme";

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onPress?: () => void;
  right?: React.ReactNode;
}

/** Icon + text + chevron row — the settings and administration lists. */
export function ListRow({ title, subtitle, icon, onPress, right }: ListRowProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.row}>
      {icon ? <IconChip name={icon} /> : null}
      <View style={styles.text}>
        <Text role="h3">{title}</Text>
        {subtitle ? (
          <Text role="bodySm" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={18} color={color.icon.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3] },
  text: { flex: 1, gap: space[1] },
});
