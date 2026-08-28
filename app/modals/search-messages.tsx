import React, { useCallback, useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Stack, router } from "expo-router";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { teamLabel } from "@/lib/teamLabel";
import { notify } from "@/lib/alertCompat";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";

interface MessageResult {
  message_id: string;
  conversation_id: string;
  body: string;
  created_at: string;
  sender_name: string;
  conversation_type: "team_group" | "direct";
  team_name?: string | null;
  team_age_group?: string | null;
  other_participant_name?: string | null;
}

function conversationLabel(row: MessageResult): string {
  if (row.conversation_type === "team_group") {
    return row.team_name ? teamLabel({ name: row.team_name, age_group: row.team_age_group }) : "Team Chat";
  }
  return row.other_participant_name ?? "Direct Message";
}

export default function SearchMessages() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const { data, error } = await supabase.rpc("search_messages", { p_query: trimmed });
    setSearching(false);
    setSearched(true);
    if (error) {
      notify("Search failed", error.message);
      return;
    }
    setResults((data as MessageResult[]) ?? []);
  }, []);

  const onChangeText = (text: string) => {
    setQuery(text);
    void runSearch(text);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/messages")} /> }} />
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search messages…"
          placeholderTextColor="#6B6F76"
          value={query}
          onChangeText={onChangeText}
          autoFocus
          returnKeyType="search"
        />
        {searching && <ActivityIndicator style={{ marginLeft: 8 }} />}
      </View>

      <FlatList
        data={results}
        keyExtractor={(r) => r.message_id}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          searched && !searching ? (
            <Text style={styles.muted}>No messages match “{query.trim()}”.</Text>
          ) : !searching && query.trim().length === 0 ? (
            <Text style={styles.muted}>Search across every conversation you're part of.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/conversation/${item.conversation_id}` as never)}>
            <View style={styles.cardHeader}>
              <Text style={styles.conversationLabel}>{conversationLabel(item)}</Text>
              <Text style={styles.time}>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</Text>
            </View>
            <Text style={styles.sender}>{item.sender_name}</Text>
            <Text style={styles.body} numberOfLines={3}>{item.body}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0D" },
  searchBar: { flexDirection: "row", alignItems: "center", margin: 16, marginBottom: 0, backgroundColor: "#141416", borderRadius: 10, borderWidth: 1, borderColor: "#242424", paddingHorizontal: 12 },
  input: { flex: 1, color: "#F2F2F3", fontSize: 15, paddingVertical: 12 },
  card: { backgroundColor: "#141416", borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  conversationLabel: { fontSize: 12, fontWeight: "700", color: "#0A6CFF" },
  time: { fontSize: 11, color: "#6B6F76" },
  sender: { fontSize: 13, fontWeight: "700", color: "#F2F2F3", marginTop: 6 },
  body: { fontSize: 14, color: "#B5B8BE", marginTop: 3, lineHeight: 19 },
  muted: { color: "#6B6F76", textAlign: "center", marginTop: 40 },
});
