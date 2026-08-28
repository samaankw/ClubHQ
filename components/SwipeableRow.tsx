import React, { useRef } from "react";
import { StyleSheet, Text } from "react-native";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { RectButton } from "react-native-gesture-handler";
import Ionicons from "@expo/vector-icons/Ionicons";

interface SwipeableRowProps {
  onDelete: () => void;
  children: React.ReactNode;
}

// Swipe-left-to-delete, matching Mail/Messages — swiping reveals a red
// delete panel the same width as the row; tapping it closes the row and
// fires the caller's delete handler (which still shows its own confirm
// alert before actually deleting).
export default function SwipeableRow({ onDelete, children }: SwipeableRowProps) {
  const ref = useRef<React.ComponentRef<typeof Swipeable>>(null);

  return (
    <Swipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      renderRightActions={() => (
        <RectButton
          style={styles.deleteAction}
          onPress={() => {
            ref.current?.close();
            onDelete();
          }}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.deleteText}>Delete</Text>
        </RectButton>
      )}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  deleteAction: {
    width: 84,
    backgroundColor: "#FF453A",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  deleteText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
