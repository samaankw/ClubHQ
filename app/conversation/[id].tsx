import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { groupLabel } from "@/lib/orgConfig";

interface MessageRow {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
}

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, orgConfig } = useAuth();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("Conversation");
  const listRef = useRef<FlatList>(null);

  // The header needs "who else is in this conversation," which
  // conversation_participants' own RLS won't let a client resolve directly
  // (its read policy only exposes the caller's own row) — the inbox RPC is
  // already the sanctioned, security-definer way to resolve that.
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.rpc("get_conversation_inbox");
      const convo = (data as { id: string; type: string; team_name: string | null; team_age_group: string | null; other_participant_name: string | null }[] | null)?.find(
        (c) => c.id === id
      );
      if (!convo) return;
      if (convo.type === "team_group") {
        setTitle(convo.team_name ? groupLabel({ name: convo.team_name, age_group: convo.team_age_group }) : `${orgConfig.labels.grouping} Chat`);
      } else {
        setTitle(convo.other_participant_name ?? "Direct Message");
      }
    })();
  }, [id, orgConfig]);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, body, created_at, profiles(full_name)")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    setMessages(
      (data ?? []).map((m) => ({
        id: m.id,
        sender_id: m.sender_id,
        body: m.body,
        created_at: m.created_at,
        sender_name: (m.profiles as unknown as { full_name: string } | null)?.full_name,
      }))
    );
  }, [id]);

  useEffect(() => {
    load();
    if (!id) return;

    // Realtime subscription: new messages appear instantly for everyone in the thread
    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  const send = async () => {
    if (!draft.trim() || !profile?.id || !id) return;
    const body = draft.trim();
    setDraft("");
    const { error } = await supabase.from("messages").insert({
      conversation_id: id,
      sender_id: profile.id,
      body,
    });
    if (!error) load();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#0B0B0D" }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title }} />
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={7}
        contentContainerStyle={{ padding: 16 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.sender_id === profile?.id;
          return (
            <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {!mine && <Text style={styles.senderName}>{item.sender_name}</Text>}
                <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                <Text style={[styles.time, mine && styles.timeMine]}>{format(new Date(item.created_at), "h:mm a")}</Text>
              </View>
            </View>
          );
        }}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          placeholderTextColor="#6B6F76"
          multiline
        />
        <Pressable style={styles.sendButton} onPress={send} disabled={!draft.trim()}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { marginBottom: 10, alignItems: "flex-start" },
  bubbleRowMine: { alignItems: "flex-end" },
  bubble: { maxWidth: "78%", borderRadius: 14, padding: 10 },
  bubbleTheirs: { backgroundColor: "#17181B" },
  bubbleMine: { backgroundColor: "#0A6CFF" },
  senderName: { fontSize: 11, fontWeight: "700", color: "#0A6CFF", marginBottom: 2 },
  bubbleText: { fontSize: 15, color: "#F2F2F3" },
  bubbleTextMine: { color: "#fff" },
  time: { fontSize: 10, color: "#6B6F76", marginTop: 4, alignSelf: "flex-end" },
  timeMine: { color: "#CFE0F0" },
  inputRow: { flexDirection: "row", padding: 10, borderTopWidth: 1, borderTopColor: "#1C1D20", backgroundColor: "#0B0B0D", alignItems: "flex-end", gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: "#242424", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 100, fontSize: 15, color: "#F2F2F3", backgroundColor: "#141416" },
  sendButton: { backgroundColor: "#0A6CFF", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendText: { color: "#fff", fontWeight: "700" },
});
