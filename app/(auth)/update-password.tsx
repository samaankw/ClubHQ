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
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();

  const update = async () => {
    if (password.length < 8) {
      setPasswordError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setConfirmError("Re-enter the same password twice.");
      return;
    }
    setPasswordError(undefined);
    setConfirmError(undefined);
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
        <Field
          placeholder="New password"
          secureTextEntry
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (passwordError) setPasswordError(undefined);
            if (confirmError) setConfirmError(undefined);
          }}
          error={passwordError}
        />
        <Field
          placeholder="Confirm new password"
          secureTextEntry
          value={confirm}
          onChangeText={(v) => {
            setConfirm(v);
            if (confirmError) setConfirmError(undefined);
          }}
          error={confirmError}
        />
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
