import { Alert, Platform } from "react-native";

// RN Web's Alert.alert() is a hard no-op (react-native-web ships an empty
// stub), so any flow gated behind it — like a destructive-action confirm —
// silently never fires when the app is opened in a browser. These wrappers
// fall back to window.confirm/alert on web so the same call site works on
// both native and web.
export function confirmAsync(title: string, message: string, confirmLabel = "Delete"): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

export interface Choice<T extends string> {
  key: T;
  label: string;
  destructive?: boolean;
}

// A confirm with more than two outcomes — "delete and tell everyone" vs
// "delete quietly" is a real fork, not a checkbox we have anywhere to put
// inside a system dialog.
//
// Native gets one alert with every option on it. Web has no multi-button
// primitive at all (window.confirm is strictly yes/no), so it asks about each
// option in turn and takes the first accept. Two dialogs is worse than one,
// but it's honest about what's being chosen, which a single OK/Cancel that
// silently picks a notification behaviour would not be.
export function chooseAsync<T extends string>(
  title: string,
  message: string,
  options: Choice<T>[]
): Promise<T | null> {
  if (Platform.OS === "web") {
    return (async () => {
      for (const option of options) {
        if (window.confirm(`${title}\n\n${message}\n\n${option.label}?`)) return option.key;
      }
      return null;
    })();
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      ...options.map((option) => ({
        text: option.label,
        style: option.destructive ? ("destructive" as const) : ("default" as const),
        onPress: () => resolve(option.key),
      })),
      { text: "Cancel", style: "cancel" as const, onPress: () => resolve(null) },
    ]);
  });
}

export function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
