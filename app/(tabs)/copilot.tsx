import React, { useState, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { supabase, SUPABASE_URL } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { OrgConfig } from "@/lib/orgConfig";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

// "across the club" and "which coaches" assumed a multi-staff club — neither
// holds for a solo private trainer, so both are sourced from org config
// instead of hardcoded.
const suggestions = (config: OrgConfig): string[] => [
  "Which players improved the most this season?",
  `What's the most common weakness across your ${config.labels.groupingPlural.toLowerCase()}?`,
  `Which ${config.labels.staffPlural.toLowerCase()} are completing evaluations consistently?`,
  "What's our homework completion rate?",
];

export default function Copilot() {
  const { profile, orgConfig } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const listRef = useRef<FlatList>(null);

  const canUse = profile?.role === "director" || profile?.role === "coach";

  const ask = async (question: string) => {
    if (!question.trim() || !profile?.club_id) return;
    const userMsg: ChatMessage = { id: `${Date.now()}-u`, role: "user", text: question.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setAsking(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/director-copilot`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({ question: question.trim() }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const result = await resp.json();
      setMessages((prev) => [...prev, { id: `${Date.now()}-a`, role: "assistant", text: result.answer }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-a`, role: "assistant", text: "Something went wrong pulling that data. Try again in a moment." },
      ]);
    } finally {
      setAsking(false);
    }
  };

  if (!canUse) {
    return (
      <View style={styles.locked}>
        <Text style={styles.lockedText}>The Director Copilot is available to coaches and directors.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#0B0B0D" }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Ask about your club</Text>
          <Text style={styles.emptySubtitle}>Player development, coach activity, homework completion — grounded in your live data.</Text>
          {suggestions(orgConfig).map((s) => (
            <Pressable key={s} style={styles.suggestionChip} onPress={() => ask(s)}>
              <Text style={styles.suggestionText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          contentContainerStyle={{ padding: 16 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[styles.bubbleRow, item.role === "user" && styles.bubbleRowMine]}>
              <View style={[styles.bubble, item.role === "user" ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, item.role === "user" && styles.bubbleTextMine]}>{item.text}</Text>
              </View>
            </View>
          )}
        />
      )}

      {asking && (
        <View style={styles.thinkingRow}>
          <ActivityIndicator size="small" color="#0A6CFF" />
          <Text style={styles.thinkingText}>Pulling club data…</Text>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask the Copilot…"
          onSubmitEditing={() => ask(draft)}
        />
        <Pressable style={styles.sendButton} onPress={() => ask(draft)} disabled={!draft.trim() || asking}>
          <Text style={styles.sendText}>Ask</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  locked: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: "#0B0B0D" },
  lockedText: { color: "#9A9DA3", textAlign: "center", fontSize: 15 },
  emptyState: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: "#0B0B0D" },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: "#F2F2F3", marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: "#9A9DA3", marginBottom: 24, lineHeight: 20 },
  suggestionChip: { backgroundColor: "#17181B", borderRadius: 12, padding: 14, marginBottom: 10 },
  suggestionText: { color: "#0A6CFF", fontWeight: "600" },
  bubbleRow: { marginBottom: 12, alignItems: "flex-start" },
  bubbleRowMine: { alignItems: "flex-end" },
  bubble: { maxWidth: "85%", borderRadius: 14, padding: 12 },
  bubbleTheirs: { backgroundColor: "#17181B" },
  bubbleMine: { backgroundColor: "#0A6CFF" },
  bubbleText: { fontSize: 15, color: "#F2F2F3", lineHeight: 21 },
  bubbleTextMine: { color: "#fff" },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingBottom: 6, backgroundColor: "#0B0B0D" },
  thinkingText: { color: "#9A9DA3", fontSize: 13 },
  inputRow: { flexDirection: "row", padding: 10, borderTopWidth: 1, borderTopColor: "#1C1D20", backgroundColor: "#0B0B0D", gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: "#242424", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: "#F2F2F3", backgroundColor: "#141416" },
  sendButton: { backgroundColor: "#0A6CFF", borderRadius: 20, paddingHorizontal: 16, justifyContent: "center" },
  sendText: { color: "#fff", fontWeight: "700" },
});
