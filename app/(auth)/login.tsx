import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { notify } from "@/lib/alertCompat";
import { Screen, Text, Field, Button } from "@/components/ui";
import { space } from "@/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();

  const handleLogin = async () => {
    const nextEmailError = !email.trim() ? "Enter your email." : undefined;
    const nextPasswordError = !password ? "Enter your password." : undefined;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      setLoading(false);
      notify("Login failed", error.message);
      return;
    }

    // Signup stores the acceptance/version in Auth metadata. On every normal
    // login, idempotently copy that acceptance into the durable consent ledger
    // so an account deletion cannot erase the only evidence that it happened.
    const { error: consentError } = await supabase.functions.invoke("record-terms-consent");
    if (consentError) console.warn("Couldn't persist terms consent ledger:", consentError.message);

    setLoading(false);
    router.replace("/(tabs)/dashboard");
  };

  return (
    <Screen scroll={false} style={styles.container}>
      <Text role="display" tone="brand" style={styles.center}>
        ClubHQ
      </Text>
      <Text tone="secondary" style={[styles.center, styles.subtitle]}>
        Sign in to your club
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
        <Field
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (passwordError) setPasswordError(undefined);
          }}
          error={passwordError}
        />
        <Button label={loading ? "Signing in…" : "Sign In"} onPress={handleLogin} disabled={loading} fullWidth />
      </View>

      <Link href="/(auth)/reset-password" style={styles.secondaryLink}>
        <Text tone="brand" role="h3">
          Forgot password?
        </Text>
      </Link>
      <Link href="/(auth)/signup" style={styles.link}>
        <Text tone="brand">Don't have an account? Sign up</Text>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "center", paddingHorizontal: space[6] },
  center: { textAlign: "center" },
  subtitle: { marginBottom: space[7] },
  form: { gap: space[3] },
  secondaryLink: { marginTop: space[4], alignSelf: "center" },
  link: { marginTop: space[5], alignSelf: "center" },
});
