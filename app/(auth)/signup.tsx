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
  const [nameError, setNameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [termsError, setTermsError] = useState<string | undefined>();

  const handleSignup = async () => {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || !cleanEmail || password.length < 8) {
      setNameError(!cleanName ? "Enter your name." : undefined);
      setEmailError(!cleanEmail ? "Enter your email." : undefined);
      setPasswordError(password.length < 8 ? "Use at least 8 characters." : undefined);
      return;
    }
    setNameError(undefined);
    setEmailError(undefined);
    setPasswordError(undefined);
    if (!agreedToTerms) {
      setTermsError("You need to agree before creating an account.");
      return;
    }
    setTermsError(undefined);

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
        <Field
          placeholder="Full name"
          value={fullName}
          onChangeText={(v) => {
            setFullName(v);
            if (nameError) setNameError(undefined);
          }}
          error={nameError}
        />
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
          placeholder="Password (8+ characters)"
          secureTextEntry
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (passwordError) setPasswordError(undefined);
          }}
          error={passwordError}
        />

        <View style={styles.roleBlock}>
          <Eyebrow>I am a…</Eyebrow>
          <SegmentedControl
            options={[ROLE_LABELS.coach, ROLE_LABELS.parent]}
            value={ROLE_LABELS[role as "coach" | "parent"]}
            onChange={(label) => setRole(LABEL_ROLES[label])}
          />
        </View>

        <Text role="bodySm" tone="secondary">
          Directors begin as coaches, then create a club. Parent consent for a child is recorded when that child is securely linked to the
          parent account.
        </Text>

        <View style={{ gap: space[2] }}>
          <Pressable
            style={styles.consentRow}
            onPress={() => {
              setAgreedToTerms((v) => !v);
              if (termsError) setTermsError(undefined);
            }}
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
          {termsError ? (
            <Text role="caption" tone="danger">
              {termsError}
            </Text>
          ) : null}
        </View>

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
