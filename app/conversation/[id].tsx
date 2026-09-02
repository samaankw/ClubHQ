import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, FlatList, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { useVocab } from "@/lib/vocab";
import { teamLabel } from "@/lib/teamLabel";
import { notify } from "@/lib/alertCompat";
import { Screen, Text, Field, Button } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

type MessageStatus = "sending" | "failed";

interface MessageRow {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
  // Absent for a server-confirmed message -- only set while an optimistic
  // send from this device is still in flight or has failed.
  status?: MessageStatus;
}

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const vocab = useVocab();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  // Kept separate from `messages` (which `load()` wholesale replaces from the
  // server) so an in-flight or failed optimistic send survives a realtime
  // refetch triggered by someone else's message landing at the same time.
  const [pending, setPending] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("Conversation");
  const listRef = useRef<FlatList>(null);

  const allMessages = useMemo(() => [...messages, ...pending], [messages, pending]);
  const isSending = pending.some((m) => m.status === "sending");

  // The header needs "who else is in this conversation," which
  // conversation_participants' own RLS won't let a client resolve directly
  // (its read policy only exposes the caller's own row) — the inbox RPC is
  // already the sanctioned, security-definer way to resolve that.
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_conversation_inbox");
      if (error) {
        notify("Couldn't load conversation", error.message);
        return;
      }
      const convo = (
        data as
          | { id: string; type: string; team_name: string | null; team_age_group: string | null; other_participant_name: string | null }[]
          | null
      )?.find((c) => c.id === id);
      if (!convo) return;
      if (convo.type === "team_group") {
        setTitle(
          convo.team_name
            ? teamLabel({ name: convo.team_name, age_group: convo.team_age_group })
            : `${vocab.group?.singular ?? vocab.member.singular} Chat`,
        );
      } else {
        setTitle(convo.other_participant_name ?? "Direct Message");
      }
    })();
  }, [id, vocab.group?.singular, vocab.member.singular]);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, body, created_at, profiles(full_name)")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (error) {
      notify("Couldn't load messages", error.message);
      return;
    }
    setMessages(
      (data ?? []).map((m) => ({
        id: m.id,
        sender_id: m.sender_id,
        body: m.body,
        created_at: m.created_at,
        sender_name: (m.profiles as unknown as { full_name: string } | null)?.full_name,
      })),
    );
  }, [id]);

  useEffect(() => {
    load();
    if (!id) return;

    // Realtime subscription: new messages appear instantly for everyone in the thread
    const channel = supabase
      .channel(`messages-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  const attemptSend = async (tempId: string, body: string) => {
    if (!profile?.id || !id) return;
    setPending((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "sending" } : m)));

    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: id, sender_id: profile.id, body })
      .select("id, sender_id, body, created_at")
      .single();

    if (error) {
      setPending((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
      notify("Message not sent", error.message);
      return;
    }

    setPending((prev) => prev.filter((m) => m.id !== tempId));
    setMessages((prev) => [
      ...prev,
      { id: data.id, sender_id: data.sender_id, body: data.body, created_at: data.created_at, sender_name: profile.full_name },
    ]);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !profile?.id || !id || isSending) return;
    const tempId = `temp-${Date.now()}`;
    setPending((prev) => [...prev, { id: tempId, sender_id: profile.id, body, created_at: new Date().toISOString(), status: "sending" }]);
    setDraft("");
    await attemptSend(tempId, body);
  };

  const retrySend = (message: MessageRow) => {
    if (isSending) return;
    void attemptSend(message.id, message.body);
  };

  return (
    <Screen scroll={false} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title }} />
      <View style={styles.flex}>
        <FlatList
          ref={listRef}
          data={allMessages}
          keyExtractor={(m) => m.id}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={7}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const mine = item.sender_id === profile?.id;
            const bubble = (
              <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                <View
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, item.status === "failed" && styles.bubbleFailed]}
                >
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
                    tone={item.status === "failed" ? "danger" : mine ? "inverse" : "tertiary"}
                    style={[styles.time, mine && styles.timeMine]}
                  >
                    {item.status === "sending"
                      ? "Sending…"
                      : item.status === "failed"
                        ? "Not sent · tap to retry"
                        : format(new Date(item.created_at), "h:mm a")}
                  </Text>
                </View>
              </View>
            );
            return item.status === "failed" ? (
              <Pressable onPress={() => retrySend(item)} accessibilityRole="button" accessibilityLabel="Retry sending message">
                {bubble}
              </Pressable>
            ) : (
              bubble
            );
          }}
        />
        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <Field value={draft} onChangeText={setDraft} placeholder="Message…" multiline style={styles.composerInput} />
          </View>
          <Button label={isSending ? "Sending…" : "Send"} onPress={send} disabled={!draft.trim() || isSending} />
        </View>
      </View>
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
  bubbleFailed: { backgroundColor: color.bg.dangerSubtle },
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
