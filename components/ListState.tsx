import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

export interface ListStateError {
  message: string;
}

interface ListStateAction {
  label: string;
  onPress: () => void;
}

interface ListStateProps {
  loading: boolean;
  error: ListStateError | null;
  isEmpty: boolean;
  onRetry: () => void;
  emptyTitle: string;
  emptyHint?: string;
  emptyAction?: ListStateAction;
  loadingLabel?: string;
  // Rendered only once loading/error/empty have all been ruled out -- lets
  // this double as a full swap-in for FlatList's ListEmptyComponent (pass no
  // children, FlatList's own renderItem covers the "data ready" case) and as
  // a standalone wrapper for non-list surfaces like a dashboard card.
  children?: React.ReactNode;
}

export default function ListState({
  loading,
  error,
  isEmpty,
  onRetry,
  emptyTitle,
  emptyHint,
  emptyAction,
  loadingLabel = "Loading…",
  children,
}: ListStateProps) {
  if (loading) {
    return (
      <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={loadingLabel}>
        <ActivityIndicator color="#0A6CFF" />
        <Text style={styles.loadingText}>{loadingLabel}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <Text style={styles.errorText}>{error.message || "Something went wrong."}</Text>
        <Pressable style={styles.retryButton} onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry loading">
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (isEmpty) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        {emptyHint ? <Text style={styles.emptyHint}>{emptyHint}</Text> : null}
        {emptyAction ? (
          <Pressable
            style={styles.retryButton}
            onPress={emptyAction.onPress}
            accessibilityRole="button"
            accessibilityLabel={emptyAction.label}
          >
            <Text style={styles.retryText}>{emptyAction.label}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 10 },
  loadingText: { color: "#9A9DA3", fontSize: 14 },
  errorText: { color: "#FF6B6B", fontSize: 14, textAlign: "center", lineHeight: 20 },
  retryButton: { backgroundColor: "#0A6CFF", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, marginTop: 4 },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  emptyTitle: { color: "#B5B8BE", fontSize: 15, fontWeight: "600", textAlign: "center" },
  emptyHint: { color: "#6B6F76", fontSize: 13, textAlign: "center", marginTop: 4, lineHeight: 18 },
});
