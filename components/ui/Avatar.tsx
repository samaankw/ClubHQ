import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { Text } from "./Text";
import { color, radius } from "@/theme";

export interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const shape = { width: size, height: size, borderRadius: radius.full };
  if (uri) return <Image source={{ uri }} style={shape} accessibilityLabel={name} />;
  return (
    <View style={[shape, styles.fallback]}>
      <Text role="label" tone="secondary">
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: color.bg.sunken, alignItems: "center", justifyContent: "center" },
});
