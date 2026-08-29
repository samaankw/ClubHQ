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

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      notify("Missing info", "Enter your email and password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (error) {
      notify("Login failed", error.message);
      return;
    }
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
          onChangeText={setEmail}
        />
        <Field placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
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
