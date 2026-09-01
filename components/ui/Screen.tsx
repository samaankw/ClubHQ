import React from "react";
import { View, ViewProps, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, layout, space } from "@/theme";

export interface ScreenProps extends ViewProps {
  scroll?: boolean;
}

/**
 * Page shell: brand page ground, bottom safe-area padding, and a capped
 * content column.
 *
 * This app is phone-first but also runs on web and tablet, where an
 * unconstrained column stretches a 375-wide design across the full viewport.
 * The ground stays full-bleed; only the content inside it is capped, and
 * `layout.maxContent` sits above the widest common phone so the cap never
 * binds on a real device.
 *
 * The cap lives here rather than in each screen so every page gets it by
 * construction — a screen has to opt out deliberately, not remember to opt in.
 */
// Forwards the ref to the underlying ScrollView (when `scroll` is true) so a
// long form can scroll a validation error back into view on failed submit —
// e.g. `scrollRef.current?.scrollTo({ y: 0, animated: true })`.
export const Screen = React.forwardRef<ScrollView, ScreenProps>(function Screen({ scroll = true, style, children, ...rest }, ref) {
  const insets = useSafeAreaInsets();
  const pad = { paddingBottom: insets.bottom + space[4] };

  if (!scroll) {
    // flex: 1 on the column so a FlatList or a screen-owned ScrollView inside
    // it still fills the available height.
    return (
      <View style={[styles.page, pad, style]} {...rest}>
        <View style={styles.columnFlex}>{children}</View>
      </View>
    );
  }
  return (
    <View style={[styles.page, style]} {...rest}>
      <ScrollView ref={ref} contentContainerStyle={[styles.grow, pad]}>
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg.page },
  grow: { flexGrow: 1 },
  column: {
    width: "100%",
    maxWidth: layout.maxContent,
    alignSelf: "center",
    padding: space[4],
    gap: space[4],
  },
  columnFlex: {
    flex: 1,
    width: "100%",
    maxWidth: layout.maxContent,
    alignSelf: "center",
  },
});
