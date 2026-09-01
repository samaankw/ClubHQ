import React from "react";
import { StyleSheet, View } from "react-native";
import { reportError } from "@/lib/errorReporting";
import { Button, Text } from "@/components/ui";
import { color, space } from "@/theme";

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
          <Text role="h1">Something went wrong</Text>
          <Text role="body" tone="secondary" style={styles.body}>
            ClubHQ ran into a problem and couldn't continue. Your data is safe -- try again, and if it keeps happening, close and reopen the
            app.
          </Text>
          <Button label="Try again" onPress={this.reset} />
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
    backgroundColor: color.bg.page,
    padding: space[6],
    gap: space[3],
  },
  body: { textAlign: "center" },
});
