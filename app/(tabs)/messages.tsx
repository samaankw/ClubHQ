import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, FlatList, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { teamLabel } from "@/lib/teamLabel";
import { Screen, Text, Card, IconChip, EmptyState } from "@/components/ui";
import { color, space, radius, borderWidth, elevation } from "@/theme";

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
    <Screen scroll={false}>
      <Pressable style={styles.searchEntry} onPress={() => router.push("/modals/search-messages")}>
        <Ionicons name="search" size={16} color={color.icon.muted} />
        <Text tone="tertiary">Search messages…</Text>
      </Pressable>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        onRefresh={load}
        refreshing={loading}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyState title="No conversations yet." body="Tap + to start one." />}
        renderItem={({ item }) => {
          const title =
            item.type === "team_group"
              ? item.team_name
                ? teamLabel({ name: item.team_name, age_group: item.team_age_group })
                : "Team Chat"
              : item.other_participant_name ?? "Direct Message";
          return (
            <Card>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={title}
                style={styles.rowInner}
                onPress={() => router.push(`/conversation/${item.id}` as never)}
              >
                <IconChip name={item.type === "team_group" ? "people" : "chatbubble"} />
                <View style={styles.rowText}>
                  <Text role="h3">{title}</Text>
                  <Text role="bodySm" tone="secondary" numberOfLines={1}>
                    {item.last_message ?? "No messages yet"}
                  </Text>
                </View>
                {item.last_message_at && (
                  <Text role="caption" tone="tertiary">
                    {formatDistanceToNow(new Date(item.last_message_at), { addSuffix: false })}
                  </Text>
                )}
              </Pressable>
            </Card>
          );
        }}
      />
      <Pressable style={styles.fab} onPress={() => router.push("/modals/new-conversation")}>
        <Ionicons name="add" size={28} color={color.text.inverse} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: color.bg.surface,
    borderWidth: borderWidth.thin,
    borderColor: color.border.subtle,
    borderRadius: radius.input,
    marginHorizontal: space[4],
    marginTop: space[4],
    paddingHorizontal: space[3],
    paddingVertical: space[3],
  },
  listContent: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[4],
    gap: space[3],
  },
  rowInner: { flexDirection: "row", alignItems: "center", gap: space[3] },
  rowText: { flex: 1, gap: space[1] },
  fab: {
    position: "absolute",
    right: space[5],
    bottom: space[6],
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: color.bg.brand,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.raised,
  },
});
