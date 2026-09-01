import React from "react";
import { View, StyleSheet } from "react-native";
import { color } from "@/theme";

export function Divider() {
  return <View style={styles.line} />;
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, backgroundColor: color.border.subtle },
});
