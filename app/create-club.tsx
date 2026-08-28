import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";

export default function CreateOrJoinClub() {
  const { profile, refreshProfile } = useAuth();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [clubName, setClubName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [working, setWorking] = useState(false);

  const createClub = async () => {
    if (!clubName.trim()) {
      notify("Missing name", "Give your club a name.");
      return;
    }
    setWorking(true);
    // Runs server-side (SECURITY DEFINER) — this is the only way an account
    // becomes a director. Nothing about role is trusted from the client.
    const { error } = await supabase.rpc("create_club", { club_name: clubName.trim() });
    setWorking(false);
    if (error) {
      notify("Couldn't create club", error.message);
      return;
    }
    await refreshProfile();
    router.replace("/(tabs)/dashboard");
  };

  const joinClub = async () => {
    if (!joinCode.trim()) {
      notify("Missing code", "Enter the invite code your director shared with you.");
      return;
    }
    setWorking(true);
    const { error } = await supabase.rpc("join_club", { code: joinCode.trim().toLowerCase() });
    setWorking(false);
    if (error) {
      notify("Couldn't join club", error.message);
      return;
    }
    await refreshProfile();
    // A parent joining still needs a second, separate code to link their
    // child (kept separate deliberately — that's a distinct parental-consent
    // step, not just club membership). Chaining straight into that screen
    // instead of the dashboard makes it read as one flow instead of a
    // confusing empty dashboard followed by a surprise second code.
    router.replace(profile?.role === "parent" ? "/claim-player" : "/(tabs)/dashboard");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>One more step</Text>
      <Text style={styles.subtitle}>Every account belongs to a club. Create a new one, or join with an invite code from your director.</Text>

      <View style={styles.toggleRow}>
        <Pressable style={[styles.toggle, mode === "create" && styles.toggleActive]} onPress={() => setMode("create")}>
          <Text style={[styles.toggleText, mode === "create" && styles.toggleTextActive]}>Create a Club</Text>
        </Pressable>
        <Pressable style={[styles.toggle, mode === "join" && styles.toggleActive]} onPress={() => setMode("join")}>
          <Text style={[styles.toggleText, mode === "join" && styles.toggleTextActive]}>Join with Code</Text>
        </Pressable>
      </View>

      {mode === "create" ? (
        <>
          <Text style={styles.note}>Creating a club makes you its director.</Text>
          <TextInput style={styles.input} placeholder="Club name" placeholderTextColor="#6B6F76" value={clubName} onChangeText={setClubName} />
          <Pressable style={styles.button} onPress={createClub} disabled={working}>
            <Text style={styles.buttonText}>{working ? "Creating…" : "Create Club"}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.note}>Your director can find their club's invite code in Profile.</Text>
          {profile?.role === "parent" && (
            <Text style={styles.note}>Right after this, you'll link your child with a separate one-time code from your director — that's a deliberate second step, not a mistake.</Text>
          )}
          <TextInput
            style={styles.input}
            placeholder="Invite code"
            placeholderTextColor="#6B6F76"
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="none"
          />
          <Pressable style={styles.button} onPress={joinClub} disabled={working}>
            <Text style={styles.buttonText}>{working ? "Joining…" : "Join Club"}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#0B0B0D" },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center", color: "#0A6CFF" },
  subtitle: { fontSize: 14, color: "#9A9DA3", textAlign: "center", marginTop: 8, marginBottom: 24, lineHeight: 20 },
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  toggle: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#0A6CFF", alignItems: "center" },
  toggleActive: { backgroundColor: "#0A6CFF" },
  toggleText: { color: "#0A6CFF", fontWeight: "700" },
  toggleTextActive: { color: "#fff" },
  note: { fontSize: 13, color: "#9A9DA3", marginBottom: 12, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#242424", borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 16, color: "#F2F2F3", backgroundColor: "#141416" },
  button: { backgroundColor: "#0A6CFF", borderRadius: 10, padding: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
