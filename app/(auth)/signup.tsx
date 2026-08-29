import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Role } from "@/types/db";
import { notify } from "@/lib/alertCompat";
import { Screen, Text, Eyebrow, Field, Button, SegmentedControl } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

const ROLE_LABELS: Record<"coach" | "parent", string> = { coach: "Coach", parent: "Parent" };
const LABEL_ROLES: Record<string, Role> = { Coach: "coach", Parent: "parent" };

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
    <Screen>
      <Text role="h1" tone="brand" style={styles.center}>
        Create your account
      </Text>

      <View style={styles.form}>
        <Field placeholder="Full name" value={fullName} onChangeText={setFullName} />
        <Field
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field placeholder="Password (8+ characters)" secureTextEntry value={password} onChangeText={setPassword} />

        <View style={styles.roleBlock}>
          <Eyebrow>I am a…</Eyebrow>
          <SegmentedControl
            options={[ROLE_LABELS.coach, ROLE_LABELS.parent]}
            value={ROLE_LABELS[role as "coach" | "parent"]}
            onChange={(label) => setRole(LABEL_ROLES[label])}
          />
        </View>

        <Text role="bodySm" tone="secondary">
          Directors begin as coaches, then create a club. Parent consent for a child is recorded when that child is
          securely linked to the parent account.
        </Text>

        <Pressable
          style={styles.consentRow}
          onPress={() => setAgreedToTerms((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreedToTerms }}
        >
          <View style={[styles.checkbox, agreedToTerms && styles.checkboxOn]}>
            {agreedToTerms && <Ionicons name="checkmark" size={14} color={color.text.inverse} />}
          </View>
          <Text role="bodySm" style={styles.consentText}>
            I agree to the{" "}
            <Link href="/(auth)/legal-terms">
              <Text role="bodySm" tone="brand" style={styles.consentLink}>
                Terms of Service
              </Text>
            </Link>{" "}
            and acknowledge the{" "}
            <Link href="/(auth)/privacy">
              <Text role="bodySm" tone="brand" style={styles.consentLink}>
                Privacy Policy
              </Text>
            </Link>
            .
          </Text>
        </Pressable>

        <Button label={loading ? "Creating…" : "Create Account"} onPress={handleSignup} disabled={loading} fullWidth />
      </View>

      <Link href="/(auth)/login" style={styles.link}>
        <Text tone="brand">Already have an account? Sign in</Text>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center" },
  form: { gap: space[3] },
  roleBlock: { gap: space[2] },
  consentRow: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  checkbox: {
    width: space[5],
    height: space[5],
    borderRadius: radius.xs,
    borderWidth: borderWidth.thin,
    borderColor: color.border.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: color.bg.brand, borderColor: color.bg.brand },
  consentText: { flex: 1 },
  consentLink: { textDecorationLine: "underline" },
  link: { alignSelf: "center" },
});
