import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, FlatList, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { teamLabel } from "@/lib/teamLabel";
import { Screen, Text, Field, Button } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

interface MessageRow {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
}

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
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
        setTitle(convo.team_name ? teamLabel({ name: convo.team_name, age_group: convo.team_age_group }) : "Team Chat");
      } else {
        setTitle(convo.other_participant_name ?? "Direct Message");
      }
    })();
  }, [id]);

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
    <Screen scroll={false}>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={7}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const mine = item.sender_id === profile?.id;
            return (
              <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && (
                    <Text role="label" tone="brand" style={styles.senderName}>
                      {item.sender_name}
                    </Text>
                  )}
                  <Text role="body" tone={mine ? "inverse" : "primary"}>
                    {item.body}
                  </Text>
                  <Text
                    role="caption"
                    tone={mine ? "inverse" : "tertiary"}
                    style={[styles.time, mine && styles.timeMine]}
                  >
                    {format(new Date(item.created_at), "h:mm a")}
                  </Text>
                </View>
              </View>
            );
          }}
        />
        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <Field value={draft} onChangeText={setDraft} placeholder="Message…" multiline style={styles.composerInput} />
          </View>
          <Button label="Send" onPress={send} disabled={!draft.trim()} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { padding: space[4], gap: space[3] },
  bubbleRow: { alignItems: "flex-start" },
  bubbleRowMine: { alignItems: "flex-end" },
  bubble: { maxWidth: "78%", borderRadius: radius.card, padding: space[3] },
  bubbleTheirs: { backgroundColor: color.bg.sunken },
  bubbleMine: { backgroundColor: color.bg.brand },
  senderName: { marginBottom: space[1] },
  time: { marginTop: space[1], alignSelf: "flex-end" },
  timeMine: { opacity: 0.75 },
  inputRow: {
    flexDirection: "row",
    padding: space[3],
    borderTopWidth: borderWidth.thin,
    borderTopColor: color.border.subtle,
    backgroundColor: color.bg.page,
    alignItems: "flex-end",
    gap: space[2],
  },
  inputWrap: { flex: 1 },
  composerInput: { maxHeight: 100 },
});
