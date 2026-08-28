import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { teamLabel } from "@/lib/teamLabel";

interface ConversationRow {
  id: string;
  type: "team_group" | "direct";
  team_id: string | null;
  team_name?: string | null;
  team_age_group?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  other_participant_name?: string | null;
}

export default function Messages() {
  const { profile } = useAuth();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_conversation_inbox");
      if (error) {
        console.error("Failed to load conversations:", error.message);
        setConversations([]);
        return;
      }
      setConversations((data as ConversationRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Refreshes the inbox (last message + ordering) the moment any new
  // message lands in any conversation — otherwise a new message wouldn't
  // show up here until a manual pull-to-refresh. No conversation_id filter
  // is possible here (this is every conversation the user's in, not one),
  // so this just reloads on any insert; message volume in this app is far
  // too low for that to matter.
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`inbox-${profile.id}-${instanceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, instanceId, load]);

  return (
    <View style={styles.container}>
      <Pressable style={styles.searchEntry} onPress={() => router.push("/modals/search-messages")}>
        <Ionicons name="search" size={16} color="#6B6F76" />
        <Text style={styles.searchEntryText}>Search messages…</Text>
      </Pressable>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        onRefresh={load}
        refreshing={loading}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        ListEmptyComponent={<Text style={styles.muted}>No conversations yet. Tap + to start one.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/conversation/${item.id}` as never)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.type === "team_group" ? "👥" : "💬"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {item.type === "team_group"
                  ? item.team_name
                    ? teamLabel({ name: item.team_name, age_group: item.team_age_group })
                    : "Team Chat"
                  : item.other_participant_name ?? "Direct Message"}
              </Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.last_message ?? "No messages yet"}
              </Text>
            </View>
            {item.last_message_at && (
              <Text style={styles.time}>{formatDistanceToNow(new Date(item.last_message_at), { addSuffix: false })}</Text>
            )}
          </Pressable>
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push("/modals/new-conversation")}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0D" },
  searchEntry: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#141416", borderRadius: 10, borderWidth: 1, borderColor: "#242424", marginHorizontal: 16, marginTop: 16, paddingHorizontal: 12, paddingVertical: 11 },
  searchEntryText: { color: "#6B6F76", fontSize: 14 },
  card: { backgroundColor: "#141416", borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#17181B", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18 },
  title: { fontSize: 15, fontWeight: "700", color: "#F2F2F3" },
  preview: { fontSize: 13, color: "#9A9DA3", marginTop: 2 },
  time: { fontSize: 11, color: "#6B6F76" },
  muted: { color: "#6B6F76", textAlign: "center", marginTop: 40 },
  fab: {
    position: "absolute", right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#0A6CFF", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  fabText: { color: "#fff", fontSize: 28, fontWeight: "700", marginTop: -2 },
});
