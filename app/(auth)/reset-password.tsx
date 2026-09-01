import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import * as Linking from "expo-linking";
import { Link } from "expo-router";
import { supabase } from "@/lib/supabase";
import { notify } from "@/lib/alertCompat";
import { Screen, Text, Field, Button } from "@/components/ui";
import { space } from "@/theme";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();

  const sendReset = async () => {
    if (!email.trim()) {
      setEmailError("Enter the email on your ClubHQ account.");
      return;
    }
    setEmailError(undefined);

    setLoading(true);

    // Hardcoding localhost:8081 here would send every password-reset email a
    // dead link once this isn't running on your own dev machine — use
    // whatever origin the app is actually being served from instead.
    // `window` can exist without `window.location` (e.g. in a test/worker
    // environment), so check the property actually being read, not just the
    // global's presence.
    const redirectTo =
      typeof window !== "undefined" && window.location ? `${window.location.origin}/update-password` : Linking.createURL("update-password");

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });

    setLoading(false);

    if (error) {
      return notify("Couldn't send reset email", error.message);
    }

    notify("Check your email", "If an account exists for that address, a password reset link has been sent.");
  };

  return (
    <Screen scroll={false} style={styles.container}>
      <Text role="display" tone="brand" style={styles.center}>
        Reset password
      </Text>
      <Text tone="secondary" style={[styles.center, styles.subtitle]}>
        We'll send you a secure link to choose a new password.
      </Text>

      <View style={styles.form}>
        <Field
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (emailError) setEmailError(undefined);
          }}
          error={emailError}
        />
        <Button label={loading ? "Sending…" : "Send Reset Link"} onPress={sendReset} disabled={loading} fullWidth />
      </View>

      <Link href="/(auth)/login" style={styles.link}>
        <Text tone="brand">Back to sign in</Text>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "center", paddingHorizontal: space[6] },
  center: { textAlign: "center" },
  subtitle: { marginBottom: space[7] },
  form: { gap: space[3] },
  link: { marginTop: space[5], alignSelf: "center" },
});
