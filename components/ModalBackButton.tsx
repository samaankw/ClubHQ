import React from "react";
import { Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

// Screens presented with presentation: "modal" get no back/close affordance
// from React Navigation by default — only swipe-to-dismiss (iOS) or the
// hardware back button (Android), neither of which is obvious inside a
// scrollable form. This gives every modal an explicit, visible way out.
export default function ModalBackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={{ paddingHorizontal: 4, paddingVertical: 4 }}>
      <Ionicons name="chevron-back" size={26} color="#F2F2F3" />
    </Pressable>
  );
}
