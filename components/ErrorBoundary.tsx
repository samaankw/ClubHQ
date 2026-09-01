import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { reportError } from "@/lib/errorReporting";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    reportError({ message: error.message }, { scope: "root-error-boundary" });
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container} accessibilityLiveRegion="polite">
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            ClubHQ ran into a problem and couldn't continue. Your data is safe -- try again, and if it keeps happening, close and reopen the
            app.
          </Text>
          <Pressable style={styles.button} onPress={this.reset} accessibilityRole="button" accessibilityLabel="Try again">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0B0D",
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: "800", color: "#F2F2F3" },
  body: { fontSize: 14, color: "#9A9DA3", textAlign: "center", lineHeight: 20 },
  button: { backgroundColor: "#0A6CFF", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
