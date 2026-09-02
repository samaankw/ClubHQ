import { View, StyleSheet } from "react-native";
import { EmptyState, Button } from "@/components/ui";
import { goBackOr } from "@/lib/navigation";
import { space } from "@/theme";

interface Props {
  title?: string;
  body: string;
  /** Route to land on when there's no back-stack to pop -- e.g. this screen
   * was opened directly via a deep link, so there's nothing to go back to. */
  fallback: string;
}

// Every role-locked screen used to roll its own EmptyState with no way out
// beyond whatever the OS back gesture happens to do -- which is nothing at
// all when the screen was reached via deep link with no history. Centralizes
// both the message and a guaranteed exit; server-side authorization (RLS,
// the RPC's own role check) is what actually enforces the lock, same as
// before -- this only fixes what happens once someone's already turned away.
export default function NotAuthorized({ title = "Not authorized", body, fallback }: Props) {
  return (
    <View style={styles.wrap}>
      <EmptyState icon="lock-closed" title={title} body={body} />
      <Button label="Go back" onPress={() => goBackOr(fallback)} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: space[4] } });
