import React, { useState, useRef } from "react";
import { View, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase, SUPABASE_URL } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Screen, Text, IconChip, ListRow, Badge } from "@/components/ui";
import NotAuthorized from "@/components/NotAuthorized";
import type { IconName } from "@/components/ui";
import { color, space, radius, borderWidth, type as typeTokens, opacity } from "@/theme";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS: { text: string; icon: IconName }[] = [
  { text: "Which players improved the most this season?", icon: "trending-up" },
  { text: "What's the most common weakness across the club?", icon: "warning-outline" },
  { text: "Which coaches are completing evaluations consistently?", icon: "checkmark-done" },
  { text: "What's our homework completion rate?", icon: "stats-chart" },
];

export default function Copilot() {
  const { profile } = useAuth();
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
      <Screen>
        <NotAuthorized
          title="Copilot locked"
          body="The Director Copilot is available to coaches and directors."
          fallback="/(tabs)/dashboard"
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} keyboardVerticalOffset={90}>
      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <IconChip name="sparkles" tone="brand" size={28} style={styles.emptyIcon} />
          <Text role="h1" style={styles.center}>
            Ask about your club
          </Text>
          <Text tone="secondary" style={[styles.center, styles.emptySubtitle]}>
            Player development, coach activity, homework completion — grounded in your live data.
          </Text>
          <View style={{ gap: space[2] }}>
            {SUGGESTIONS.map((s) => (
              <ListRow key={s.text} icon={s.icon} title={s.text} onPress={() => ask(s.text)} />
            ))}
          </View>
          <Badge label="GROUNDED IN YOUR LIVE DATA" tone="brand" style={styles.groundedBadge} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          contentContainerStyle={{ padding: space[4] }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[styles.bubbleRow, item.role === "user" && styles.bubbleRowMine]}>
              <View style={[styles.bubble, item.role === "user" ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text tone={item.role === "user" ? "inverse" : "primary"}>{item.text}</Text>
              </View>
            </View>
          )}
        />
      )}

      {asking && (
        <View style={styles.thinkingRow}>
          <ActivityIndicator size="small" color={color.icon.brand} />
          <Text tone="secondary" role="bodySm">
            Pulling club data…
          </Text>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask the Copilot…"
          placeholderTextColor={color.text.tertiary}
          onSubmitEditing={() => ask(draft)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={[styles.sendButton, (!draft.trim() || asking) && styles.sendButtonDisabled]}
          onPress={() => ask(draft)}
          disabled={!draft.trim() || asking}
        >
          <Ionicons name="arrow-up" size={20} color={color.icon.inverse} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center" },
  emptyState: { flex: 1, padding: space[6], paddingTop: space[8], gap: space[3], alignItems: "stretch" },
  emptyIcon: { alignSelf: "center", width: space[9], height: space[9], borderRadius: radius.full, marginBottom: space[2] },
  emptySubtitle: { marginBottom: space[3] },
  groundedBadge: { alignSelf: "center", marginTop: space[3] },
  bubbleRow: { marginBottom: space[3], alignItems: "flex-start" },
  bubbleRowMine: { alignItems: "flex-end" },
  bubble: { maxWidth: "85%", borderRadius: radius.lg, padding: space[3] },
  bubbleTheirs: { backgroundColor: color.bg.sunken },
  bubbleMine: { backgroundColor: color.bg.brand },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[5], paddingBottom: space[2] },
  inputRow: {
    flexDirection: "row",
    padding: space[3],
    borderTopWidth: borderWidth.thin,
    borderTopColor: color.border.subtle,
    gap: space[2],
  },
  input: {
    flex: 1,
    borderWidth: borderWidth.thin,
    borderColor: color.border.subtle,
    borderRadius: radius.full,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
    backgroundColor: color.bg.surface,
  },
  sendButton: {
    width: space[10],
    height: space[10],
    borderRadius: radius.full,
    backgroundColor: color.bg.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: opacity.disabled },
});
