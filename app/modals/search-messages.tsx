import React, { useCallback, useState } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Stack, router } from "expo-router";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { teamLabel } from "@/lib/teamLabel";
import { useVocab } from "@/lib/vocab";
import { notify } from "@/lib/alertCompat";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";
import { Screen, Card, Text, Field } from "@/components/ui";
import { color, space } from "@/theme";

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

function conversationLabel(row: MessageResult, groupChatLabel: string): string {
  if (row.conversation_type === "team_group") {
    return row.team_name ? teamLabel({ name: row.team_name, age_group: row.team_age_group }) : groupChatLabel;
  }
  return row.other_participant_name ?? "Direct Message";
}

export default function SearchMessages() {
  const vocab = useVocab();
  const groupChatLabel = `${vocab.group?.singular ?? vocab.member.singular} Chat`;
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
    <Screen scroll={false}>
      <Stack.Screen options={{ headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/messages")} /> }} />
      <View style={styles.searchBar}>
        <View style={styles.searchField}>
          <Field placeholder="Search messages…" value={query} onChangeText={onChangeText} autoFocus returnKeyType="search" />
        </View>
        {searching && <ActivityIndicator style={styles.spinner} color={color.icon.brand} />}
      </View>

      <FlatList
        style={styles.list}
        data={results}
        keyExtractor={(r) => r.message_id}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          searched && !searching ? (
            <Text tone="secondary" style={styles.centerText}>
              No messages match “{query.trim()}”.
            </Text>
          ) : !searching && query.trim().length === 0 ? (
            <Text tone="secondary" style={styles.centerText}>
              Search across every conversation you're part of.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/conversation/${item.conversation_id}` as never)}>
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <Text role="label" tone="brand">
                  {conversationLabel(item, groupChatLabel)}
                </Text>
                <Text role="caption" tone="tertiary">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </Text>
              </View>
              <Text role="h3">{item.sender_name}</Text>
              <Text tone="secondary" numberOfLines={3}>
                {item.body}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[4], paddingTop: space[4] },
  searchField: { flex: 1 },
  spinner: { marginLeft: space[2] },
  list: { flex: 1 },
  listContent: { padding: space[4], gap: space[3] },
  card: { gap: space[1] },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  centerText: { textAlign: "center", marginTop: space[10] },
});
