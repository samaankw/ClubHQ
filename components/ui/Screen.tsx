import React from "react";
import { View, ViewProps, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, space } from "@/theme";

export interface ScreenProps extends ViewProps {
  scroll?: boolean;
}

/** Page shell: brand page ground plus bottom safe-area padding. */
export function Screen({ scroll = true, style, children, ...rest }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const pad = { paddingBottom: insets.bottom + space[4] };

  if (!scroll) {
    return (
      <View style={[styles.page, pad, style]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <View style={[styles.page, style]} {...rest}>
      <ScrollView contentContainerStyle={[styles.content, pad]}>{children}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg.page },
  content: { padding: space[4], gap: space[4] },
});
