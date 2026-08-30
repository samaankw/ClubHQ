import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";
import { Screen, Text, Field, Button } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

export default function ClaimPlayer() {
  const { profile } = useAuth();
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [roleError, setRoleError] = useState<string | undefined>();
  const [codeError, setCodeError] = useState<string | undefined>();
  const [consentError, setConsentError] = useState<string | undefined>();

  const claim = async () => {
    if (profile?.role !== "parent") {
      setRoleError("Player links can only be claimed by a parent account.");
      return;
    }
    if (!code.trim()) {
      setCodeError("Enter the 8-character player link code from your club director.");
      return;
    }
    if (!consent) {
      setConsentError("Confirm your parental authority and consent for this player's ClubHQ development record.");
      return;
    }
    setRoleError(undefined);
    setCodeError(undefined);
    setConsentError(undefined);
    setWorking(true);
    const { data, error } = await supabase.rpc("claim_parent_link_code", { p_code: code.trim(), p_confirm_parental_consent: true });
    setWorking(false);
    if (error) return notify("Couldn't link player", error.message);
    notify("Player linked", "The player is now connected to your parent account.");
    router.replace(`/player/${data}` as never);
  };

  return (
    <Screen>
      <Text role="h1" tone="brand">
        Link your child
      </Text>
      <Text tone="secondary">
        Your director creates a one-time player link code. This keeps player records separate from the general club
        invite code.
      </Text>
      {roleError ? (
        <Text role="caption" tone="danger">
          {roleError}
        </Text>
      ) : null}
      <Field
        placeholder="Player link code"
        autoCapitalize="characters"
        value={code}
        onChangeText={(v) => {
          setCode(v);
          if (codeError) setCodeError(undefined);
        }}
        style={styles.codeInput}
        error={codeError}
      />
      <View style={{ gap: space[2] }}>
        <Pressable
          style={styles.consentRow}
          onPress={() => {
            setConsent((v) => !v);
            if (consentError) setConsentError(undefined);
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
        >
          <View style={[styles.checkbox, consent && styles.checkboxOn]}>
            {consent && <Ionicons name="checkmark" size={14} color={color.text.inverse} />}
          </View>
          <Text role="bodySm" tone="secondary" style={styles.consentText}>
            I confirm I am this player's parent or legal guardian and consent to ClubHQ processing this player's
            development data, including AI-assisted coaching reports.
          </Text>
        </Pressable>
        {consentError ? (
          <Text role="caption" tone="danger">
            {consentError}
          </Text>
        ) : null}
      </View>
      <Button label={working ? "Linking…" : "Link Player"} onPress={claim} disabled={working} fullWidth />
      <Pressable style={styles.skipLink} onPress={() => router.replace("/(tabs)/dashboard")}>
        <Text role="label" tone="secondary" style={styles.skipLinkText}>
          Don't have the code yet? Skip for now
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeInput: { letterSpacing: 2 },
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
  skipLink: { alignSelf: "center" },
  skipLinkText: { textDecorationLine: "underline" },
});
