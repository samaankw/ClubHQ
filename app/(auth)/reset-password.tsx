import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import * as Linking from "expo-linking";
import { Link } from "expo-router";
import { supabase } from "@/lib/supabase";
import { notify } from "@/lib/alertCompat";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const sendReset = async () => {
  if (!email.trim()) {
    return notify(
      "Email required",
      "Enter the email on your ClubHQ account."
    );
  }

  setLoading(true);

  // Hardcoding localhost:8081 here would send every password-reset email a
  // dead link once this isn't running on your own dev machine — use
  // whatever origin the app is actually being served from instead.
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/update-password`
      : Linking.createURL("update-password");

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo }
  );

  setLoading(false);

  if (error) {
    return notify("Couldn't send reset email", error.message);
  }

  notify(
    "Check your email",
    "If an account exists for that address, a password reset link has been sent."
  );
};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset password</Text>
      <Text style={styles.copy}>We'll send you a secure link to choose a new password.</Text>
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Pressable style={styles.button} onPress={sendReset} disabled={loading}><Text style={styles.buttonText}>{loading ? "Sending…" : "Send Reset Link"}</Text></Pressable>
      <Link href="/(auth)/login" style={styles.link}>Back to sign in</Link>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 26, fontWeight: "800", color: "#0F4C81", textAlign: "center" },
  copy: { color: "#666", textAlign: "center", marginTop: 8, marginBottom: 24 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, fontSize: 16 },
  button: { backgroundColor: "#0F4C81", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 14 },
  buttonText: { color: "#fff", fontWeight: "700" },
  link: { alignSelf: "center", marginTop: 20, color: "#0F4C81" },
});
