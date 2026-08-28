import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { supabase, SUPABASE_URL } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";

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
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreButtons}>
        {[...Array(10)].map((_, i) => {
          const n = i + 1;
          return (
            <Pressable key={n} onPress={() => onChange(n)} style={[styles.scorePip, n <= value && styles.scorePipActive]}>
              <Text style={[styles.scorePipText, n <= value && styles.scorePipTextActive]}>{n}</Text>
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
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(SKILLS.map((s) => [s.key, 5]))
  );
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
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/generate-development-plan`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${sessionData.session?.access_token}`,
          },
          body: JSON.stringify({ evaluation_id: evaluation.id }),
        }
      );
      if (!resp.ok) throw new Error(await resp.text());
      setGeneratingPlan(false);
      notify("Evaluation saved", `${playerName}'s AI plan is ready as a draft. Review and publish it from the player profile before parents can see it.`);
    } catch (e) {
      setGeneratingPlan(false);
      const reason = e instanceof Error ? e.message : String(e);
      console.error("Development plan generation failed:", reason);
      notify(
        "Evaluation saved, but plan generation failed",
        `${reason}\n\nThe evaluation itself was recorded — you can retry plan generation from the player's profile.`
      );
    }

    goBackOr(playerId ? `/player/${playerId}` : "/(tabs)/players");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ headerLeft: () => <ModalBackButton onPress={() => goBackOr(playerId ? `/player/${playerId}` : "/(tabs)/players")} /> }} />
      <Text style={styles.header}>Evaluating {playerName}</Text>
      <Text style={styles.subheader}>Tap a score 1–10 for each category.</Text>

      {SKILLS.map((s) => (
        <ScoreRow
          key={s.key}
          label={s.label}
          value={scores[s.key]}
          onChange={(n) => setScores((prev) => ({ ...prev, [s.key]: n }))}
        />
      ))}

      <Text style={styles.notesLabel}>Coach notes (optional)</Text>
      <TextInput
        style={styles.notesInput}
        placeholder="e.g. Much more comfortable using left foot today, still hesitant to scan before receiving…"
        placeholderTextColor="#6B6F76"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      <Text style={styles.hint}>
        Tip: a future version can transcribe a spoken note here automatically — for now, type what you'd say out loud.
      </Text>

      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting || generatingPlan}>
        <Text style={styles.buttonText}>
          {generatingPlan ? "Generating AI development plan…" : submitting ? "Saving…" : "Save & Generate Plan"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#0B0B0D", flexGrow: 1 },
  header: { fontSize: 20, fontWeight: "800", color: "#F2F2F3" },
  subheader: { fontSize: 13, color: "#9A9DA3", marginBottom: 16 },
  scoreRow: { marginBottom: 14 },
  scoreLabel: { fontSize: 14, fontWeight: "600", marginBottom: 6, color: "#F2F2F3" },
  scoreButtons: { flexDirection: "row", gap: 4 },
  scorePip: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: "#242424", alignItems: "center", justifyContent: "center" },
  scorePipActive: { backgroundColor: "#0A6CFF", borderColor: "#0A6CFF" },
  scorePipText: { fontSize: 11, color: "#6B6F76" },
  scorePipTextActive: { color: "#fff", fontWeight: "700" },
  notesLabel: { fontSize: 14, fontWeight: "600", marginTop: 8, marginBottom: 6, color: "#F2F2F3" },
  notesInput: { borderWidth: 1, borderColor: "#242424", borderRadius: 10, padding: 12, height: 100, textAlignVertical: "top", fontSize: 15, color: "#F2F2F3", backgroundColor: "#141416" },
  hint: { fontSize: 12, color: "#6B6F76", marginTop: 6, marginBottom: 20, fontStyle: "italic" },
  button: { backgroundColor: "#0A6CFF", borderRadius: 10, padding: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
