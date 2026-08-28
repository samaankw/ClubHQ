import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { router, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";

interface TeamRow {
  id: string;
  name: string;
  age_group?: string | null;
}
interface PersonRow {
  id: string;
  full_name: string;
  role: string;
}

export default function NewConversation() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<"team" | "direct">("team");
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    (async () => {
      if (!profile?.club_id) return;
      setLoading(true);
      const { data: teamData } = await supabase.from("teams").select("id, name, age_group").eq("club_id", profile.club_id).is("archived_at", null);
      setTeams((teamData as TeamRow[]) ?? []);
      const { data: peopleData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("club_id", profile.club_id)
        .neq("id", profile.id);
      setPeople((peopleData as PersonRow[]) ?? []);
      setLoading(false);
    })();
  }, [profile?.club_id, profile?.id]);

  const startTeamChat = async (team: TeamRow) => {
    setWorking(true);
    // All the membership/authorization logic now lives server-side in this
    // function, verified against the caller's real club — the client no
    // longer inserts conversation rows or participant lists directly.
    const { data: conversationId, error } = await supabase.rpc("start_team_conversation", { p_team_id: team.id });
    setWorking(false);
    if (error || !conversationId) {
      notify("Couldn't start chat", error?.message ?? "Unknown error");
      return;
    }
    router.replace(`/conversation/${conversationId}` as never);
  };

  const startDirect = async (person: PersonRow) => {
    setWorking(true);
    const { data: conversationId, error } = await supabase.rpc("start_direct_conversation", { p_other_user_id: person.id });
    setWorking(false);
    if (error || !conversationId) {
      notify("Couldn't start chat", error?.message ?? "Unknown error");
      return;
    }
    router.replace(`/conversation/${conversationId}` as never);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/messages")} /> }} />
      <View style={styles.toggleRow}>
        <Pressable style={[styles.toggle, mode === "team" && styles.toggleActive]} onPress={() => setMode("team")}>
          <Text style={[styles.toggleText, mode === "team" && styles.toggleTextActive]}>Team Chat</Text>
        </Pressable>
        <Pressable style={[styles.toggle, mode === "direct" && styles.toggleActive]} onPress={() => setMode("direct")}>
          <Text style={[styles.toggleText, mode === "direct" && styles.toggleTextActive]}>Direct Message</Text>
        </Pressable>
      </View>

      {loading || working ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : mode === "team" ? (
        <FlatList
          data={teams}
          keyExtractor={(t) => t.id}
          ListEmptyComponent={<Text style={styles.muted}>No teams found for your club yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => startTeamChat(item)}>
              <Text style={styles.rowText}>👥 {teamLabel(item)}</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          ListEmptyComponent={<Text style={styles.muted}>No one else in your club yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => startDirect(item)}>
              <Text style={styles.rowText}>{item.full_name}</Text>
              <Text style={styles.rowMeta}>{item.role}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0D", padding: 16 },
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  toggle: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#0A6CFF", alignItems: "center" },
  toggleActive: { backgroundColor: "#0A6CFF" },
  toggleText: { color: "#0A6CFF", fontWeight: "700" },
  toggleTextActive: { color: "#fff" },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#242424", flexDirection: "row", justifyContent: "space-between" },
  rowText: { fontSize: 16, fontWeight: "600", color: "#F2F2F3" },
  rowMeta: { fontSize: 13, color: "#9A9DA3", textTransform: "capitalize" },
  muted: { color: "#6B6F76", textAlign: "center", marginTop: 40 },
});
