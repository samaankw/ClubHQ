import React, { useEffect, useState } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { router, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";
import { Screen, Text, SegmentedControl, ListRow } from "@/components/ui";
import { color, space } from "@/theme";

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
    <Screen scroll={false} style={styles.page}>
      <Stack.Screen options={{ headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/messages")} /> }} />
      <View style={styles.toggleRow}>
        <SegmentedControl
          options={["Team Chat", "Direct Message"]}
          value={mode === "team" ? "Team Chat" : "Direct Message"}
          onChange={(v) => setMode(v === "Team Chat" ? "team" : "direct")}
        />
      </View>

      {loading || working ? (
        <View style={styles.list}>
          <ActivityIndicator style={styles.spinner} color={color.icon.brand} />
        </View>
      ) : mode === "team" ? (
        <FlatList
          style={styles.list}
          data={teams}
          keyExtractor={(t) => t.id}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          ListEmptyComponent={
            <Text tone="secondary" style={styles.centerText}>
              No teams found for your club yet.
            </Text>
          }
          renderItem={({ item }) => (
            <ListRow icon="people" title={teamLabel(item)} onPress={() => startTeamChat(item)} />
          )}
        />
      ) : (
        <FlatList
          style={styles.list}
          data={people}
          keyExtractor={(p) => p.id}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          ListEmptyComponent={
            <Text tone="secondary" style={styles.centerText}>
              No one else in your club yet.
            </Text>
          }
          renderItem={({ item }) => (
            <ListRow title={item.full_name} subtitle={item.role} onPress={() => startDirect(item)} />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: space[4] },
  toggleRow: { marginBottom: space[4] },
  list: { flex: 1 },
  spinner: { marginTop: space[10] },
  centerText: { textAlign: "center", marginTop: space[10] },
});
