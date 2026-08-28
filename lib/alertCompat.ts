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

export function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
