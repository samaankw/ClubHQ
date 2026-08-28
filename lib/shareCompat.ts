import { Share, Platform } from "react-native";
import { notify } from "./alertCompat";

// Both navigator.share and the modern navigator.clipboard API are only
// available in a "secure context" (https:// or localhost) — on plain http://
// (e.g. testing over a LAN IP like http://10.0.0.184:8081), the browser
// leaves both undefined entirely, regardless of browser support otherwise.
// This legacy execCommand("copy") path still works there: it doesn't check
// secure-context at all, just deprecated in favor of the API above.
function legacyCopy(text: string): boolean {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

// RN Web's Share.share() throws synchronously ("Share is not supported in
// this browser") on any browser without the Web Share API (most desktop
// browsers, and plenty of mobile ones outside a secure/user-gesture
// context). Route web through navigator.share when it exists, otherwise
// fall back to copying the text to the clipboard.
export async function shareText(message: string) {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ text: message });
      } catch {
        // user dismissed the native share sheet — nothing to do
      }
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(message);
      notify("Copied to clipboard", message);
      return;
    }
    if (typeof document !== "undefined" && legacyCopy(message)) {
      notify("Copied to clipboard", message);
      return;
    }
    notify("Share unavailable", message);
    return;
  }
  Share.share({ message });
}
