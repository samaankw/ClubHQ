import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { supabase, SUPABASE_URL } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";
import { Screen, Card, Text, Eyebrow, Field, Button } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

const SKILLS: { key: string; label: string }[] = [
  { key: "first_touch", label: "First Touch" },
  { key: "ball_control", label: "Ball Control" },
  { key: "passing", label: "Passing" },
  { key: "dribbling", label: "Dribbling" },
  { key: "weak_foot", label: "Weak Foot" },
  { key: "finishing", label: "Finishing" },
  { key: "decision_making", label: "Decision Making" },
  { key: "scanning", label: "Scanning" },
  { key: "speed", label: "Speed" },
  { key: "positioning", label: "Positioning" },
];

function ScoreRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.scoreRow}>
      <Text role="h3">{label}</Text>
      <View style={styles.scoreButtons}>
        {[...Array(10)].map((_, i) => {
          const n = i + 1;
          const active = n <= value;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${n}`}
              accessibilityState={{ selected: active }}
              style={[styles.scorePip, active && styles.scorePipActive]}
            >
              <Text role="caption" tone={active ? "inverse" : "tertiary"} style={active && styles.scorePipTextActive}>
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function EvaluatePlayer() {
  const { playerId, playerName } = useLocalSearchParams<{ playerId: string; playerName: string }>();
  const { profile } = useAuth();
  const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries(SKILLS.map((s) => [s.key, 5])));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const handleSubmit = async () => {
    if (!profile?.id || !playerId) return;
    setSubmitting(true);

    const { data: evaluation, error } = await supabase
      .from("evaluations")
      .insert({
        player_id: playerId,
        coach_id: profile.id,
        coach_notes: notes.trim() || null,
        source: "manual",
        ...scores,
      })
      .select()
      .single();

    setSubmitting(false);

    if (error || !evaluation) {
      notify("Couldn't save evaluation", error?.message ?? "Unknown error");
      return;
    }

    // Kick off AI development plan generation via edge function
    setGeneratingPlan(true);
    const { data: sessionData } = await supabase.auth.getSession();
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-development-plan`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({ evaluation_id: evaluation.id }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setGeneratingPlan(false);
      notify(
        "Evaluation saved",
        `${playerName}'s AI plan is ready as a draft. Review and publish it from the player profile before parents can see it.`,
      );
    } catch (e) {
      setGeneratingPlan(false);
      const reason = e instanceof Error ? e.message : String(e);
      console.error("Development plan generation failed:", reason);
      notify(
        "Evaluation saved, but plan generation failed",
        `${reason}\n\nThe evaluation itself was recorded — you can retry plan generation from the player's profile.`,
      );
    }

    goBackOr(playerId ? `/player/${playerId}` : "/(tabs)/players");
  };

  return (
    <Screen>
      <Stack.Screen
        options={{ headerLeft: () => <ModalBackButton onPress={() => goBackOr(playerId ? `/player/${playerId}` : "/(tabs)/players")} /> }}
      />

      <Text role="h1">Evaluating {playerName}</Text>
      <Text tone="secondary">Tap a score 1–10 for each category.</Text>

      <Card style={styles.card}>
        {SKILLS.map((s) => (
          <ScoreRow key={s.key} label={s.label} value={scores[s.key]} onChange={(n) => setScores((prev) => ({ ...prev, [s.key]: n }))} />
        ))}
      </Card>

      <Field
        label="Coach notes (optional)"
        placeholder="e.g. Much more comfortable using left foot today, still hesitant to scan before receiving…"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      <Text role="caption" tone="tertiary">
        Tip: a future version can transcribe a spoken note here automatically — for now, type what you'd say out loud.
      </Text>

      <Button
        label={generatingPlan ? "Generating AI development plan…" : submitting ? "Saving…" : "Save & Generate Plan"}
        onPress={handleSubmit}
        disabled={submitting || generatingPlan}
        size="lg"
        fullWidth
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
  scoreRow: { gap: space[2] },
  scoreButtons: { flexDirection: "row", gap: space[1] },
  scorePip: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: borderWidth.thin,
    borderColor: color.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  scorePipActive: { backgroundColor: color.bg.brand, borderColor: color.bg.brand },
  scorePipTextActive: { fontWeight: "700" },
});
