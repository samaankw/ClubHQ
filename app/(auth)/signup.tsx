import React, { useState } from "react";
import { Text, TextInput, Pressable, StyleSheet, ScrollView, View } from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Role } from "@/types/db";
import { notify } from "@/lib/alertCompat";

const ROLES: Role[] = ["coach", "parent"];

export default function Signup() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("parent");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || !cleanEmail || password.length < 8) {
      notify("Check your details", "Enter your name, email, and a password with at least 8 characters.");
      return;
    }
    if (!agreedToTerms) {
      notify("Please review the Terms & Privacy Policy", "You need to agree before creating an account.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: cleanName, role, terms_accepted: true, terms_version: "v2" } },
      });
      if (error || !data.user) {
        notify("Sign up failed", error?.message ?? "Unknown error");
        return;
      }

      if (!data.session) {
        notify("Check your email", "Confirm your email, then return to ClubHQ and sign in.");
        router.replace("/(auth)/login");
        return;
      }
      router.replace("/(tabs)/dashboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create your account</Text>
      <TextInput style={styles.input} placeholder="Full name" value={fullName} onChangeText={setFullName} />
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password (8+ characters)" secureTextEntry value={password} onChangeText={setPassword} />

      <Text style={styles.label}>I am a…</Text>
      <View style={styles.roleRow}>
        {ROLES.map((r) => (
          <Pressable key={r} style={[styles.roleChip, role === r && styles.roleChipActive]} onPress={() => setRole(r)}>
            <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>{r[0].toUpperCase() + r.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>Directors begin as coaches, then create a club. Parent consent for a child is recorded when that child is securely linked to the parent account.</Text>

      <Pressable style={styles.consentRow} onPress={() => setAgreedToTerms((v) => !v)}>
        <View style={[styles.checkbox, agreedToTerms && styles.checkboxOn]}>{agreedToTerms && <Text style={styles.checkmark}>✓</Text>}</View>
        <Text style={styles.consentText}>I agree to the <Link href="/(auth)/legal-terms" style={styles.consentLink}>Terms of Service</Link> and acknowledge the <Link href="/(auth)/privacy" style={styles.consentLink}>Privacy Policy</Link>.</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={handleSignup} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Creating…" : "Create Account"}</Text>
      </Pressable>
      <Link href="/(auth)/login" style={styles.link}>Already have an account? Sign in</Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 24, color: "#0F4C81" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 16 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 8, marginBottom: 8, color: "#333" },
  roleRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  roleChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: "#0F4C81" },
  roleChipActive: { backgroundColor: "#0F4C81" },
  roleChipText: { color: "#0F4C81", fontWeight: "600" },
  roleChipTextActive: { color: "#fff" },
  hint: { fontSize: 12, color: "#888", marginBottom: 20, lineHeight: 17 },
  consentRow: { flexDirection: "row", gap: 10, marginBottom: 14, alignItems: "flex-start" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#0F4C81", alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxOn: { backgroundColor: "#0F4C81" },
  checkmark: { color: "#fff", fontWeight: "800", fontSize: 13 },
  consentText: { flex: 1, fontSize: 13, color: "#333", lineHeight: 18 },
  consentLink: { color: "#0F4C81", fontWeight: "700", textDecorationLine: "underline" },
  button: { backgroundColor: "#0F4C81", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  link: { marginTop: 20, alignSelf: "center" },
});
