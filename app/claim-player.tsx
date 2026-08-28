import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";

export default function ClaimPlayer() {
  const { profile } = useAuth();
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);

  const claim = async () => {
    if (profile?.role !== "parent") return notify("Parent account required", "Player links can only be claimed by a parent account.");
    if (!code.trim()) return notify("Code required", "Enter the 8-character player link code from your club director.");
    if (!consent) return notify("Consent required", "Confirm your parental authority and consent for this player's ClubHQ development record.");
    setWorking(true);
    const { data, error } = await supabase.rpc("claim_parent_link_code", { p_code: code.trim(), p_confirm_parental_consent: true });
    setWorking(false);
    if (error) return notify("Couldn't link player", error.message);
    notify("Player linked", "The player is now connected to your parent account.");
    router.replace(`/player/${data}` as never);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Link your child</Text>
      <Text style={styles.copy}>Your director creates a one-time player link code. This keeps player records separate from the general club invite code.</Text>
      <TextInput style={styles.input} placeholder="Player link code" placeholderTextColor="#6B6F76" autoCapitalize="characters" value={code} onChangeText={setCode} />
      <Pressable style={styles.consentRow} onPress={() => setConsent((v) => !v)}>
        <View style={[styles.checkbox, consent && styles.checkboxOn]}>{consent && <Text style={styles.check}>✓</Text>}</View>
        <Text style={styles.consentText}>I confirm I am this player's parent or legal guardian and consent to ClubHQ processing this player's development data, including AI-assisted coaching reports.</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={claim} disabled={working}><Text style={styles.buttonText}>{working ? "Linking…" : "Link Player"}</Text></Pressable>
      <Pressable style={styles.skipLink} onPress={() => router.replace("/(tabs)/dashboard")}>
        <Text style={styles.skipLinkText}>Don't have the code yet? Skip for now</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#0B0B0D" },
  title: { fontSize: 24, fontWeight: "800", color: "#0A6CFF" },
  copy: { color: "#9A9DA3", lineHeight: 20, marginTop: 8, marginBottom: 20 },
  input: { borderWidth: 1, borderColor: "#242424", borderRadius: 10, padding: 14, fontSize: 17, letterSpacing: 2, marginBottom: 18, color: "#F2F2F3", backgroundColor: "#141416" },
  consentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 20 },
  checkbox: { width: 22, height: 22, borderWidth: 2, borderColor: "#0A6CFF", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#0A6CFF" },
  check: { color: "#fff", fontWeight: "800" },
  consentText: { flex: 1, color: "#B5B8BE", fontSize: 13, lineHeight: 19 },
  button: { backgroundColor: "#0A6CFF", borderRadius: 10, padding: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  skipLink: { marginTop: 16, alignItems: "center" },
  skipLinkText: { color: "#9A9DA3", fontSize: 13, fontWeight: "600", textDecorationLine: "underline" },
});
