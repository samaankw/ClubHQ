import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { notify } from "@/lib/alertCompat";
import { Screen, Text, Field, Button } from "@/components/ui";
import { space } from "@/theme";

export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const update = async () => {
    if (password.length < 8) return notify("Password too short", "Use at least 8 characters.");
    if (password !== confirm) return notify("Passwords don't match", "Re-enter the same password twice.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return notify("Couldn't update password", error.message);
    notify("Password updated", "Your new password is ready to use.");
    router.replace("/(tabs)/dashboard");
  };

  return (
    <Screen scroll={false} style={styles.container}>
      <Text role="display" tone="brand" style={styles.center}>
        Choose a new password
      </Text>

      <View style={styles.form}>
        <Field placeholder="New password" secureTextEntry value={password} onChangeText={setPassword} />
        <Field placeholder="Confirm new password" secureTextEntry value={confirm} onChangeText={setConfirm} />
        <Button label={loading ? "Updating…" : "Update Password"} onPress={update} disabled={loading} fullWidth />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "center", paddingHorizontal: space[6] },
  center: { textAlign: "center", marginBottom: space[7] },
  form: { gap: space[3] },
});
