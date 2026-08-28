import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { notify } from "@/lib/alertCompat";

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
    <View style={styles.container}>
      <Text style={styles.title}>ClubHQ</Text>
      <Text style={styles.subtitle}>Sign in to your club</Text>

      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />

      <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Signing in…" : "Sign In"}</Text>
      </Pressable>

      <Link href="/(auth)/reset-password" style={styles.secondaryLink}>Forgot password?</Link>
      <Link href="/(auth)/signup" style={styles.link}>Don't have an account? Sign up</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 32, fontWeight: "800", textAlign: "center", color: "#0F4C81" },
  subtitle: { fontSize: 15, textAlign: "center", color: "#666", marginBottom: 32 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: "#0F4C81", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryLink: { marginTop: 16, alignSelf: "center", color: "#0F4C81", fontWeight: "600" },
  link: { marginTop: 20, alignSelf: "center" },
});
