import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { supabase, SUPABASE_URL } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";

type Stage = "idle" | "listening" | "extracting" | "reviewing" | "saving";

interface Update {
  player_name: string;
  player_id: string | null;
  skill: string;
  direction: "up" | "down" | "flat";
  note: string;
  include: boolean;
}

export default function VoiceEvaluation() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { profile } = useAuth();
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [updates, setUpdates] = useState<Update[]>([]);

  const transcriptRef = useRef("");

  const applyTranscript = (value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  };

  useSpeechRecognitionEvent("result", (event) => {
    const value = event.results?.[0]?.transcript;
    if (value) applyTranscript(value);
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (stage === "listening" && event.error !== "no-speech") {
      setStage("idle");
      notify("Speech recognition stopped", event.message || "Please try again.");
    }
  });


  const startListening = async () => {
    applyTranscript("");
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        notify("Permission needed", "ClubHQ needs microphone and speech-recognition permission for voice evaluations.");
        return;
      }
      setStage("listening");
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        recordingOptions: { persist: false },
      });
    } catch {
      setStage("idle");
      notify(
        "Couldn't start listening",
        "Speech recognition requires a ClubHQ development or production build. Rebuild the native app after installing dependencies."
      );
    }
  };

  const stopAndExtract = async () => {
    setStage("extracting");
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // no-op — already stopped
    }

    const capturedTranscript = transcriptRef.current.trim();
    if (!capturedTranscript || !teamId) {
      setStage("idle");
      notify("Nothing captured", "Didn't catch any speech — try again a bit closer to the mic.");
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Your session expired. Please sign in again.");

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/extract-voice-note`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ transcript: capturedTranscript, team_id: teamId }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const result = await resp.json();
      setUpdates((result.updates ?? []).map((u: Omit<Update, "include">) => ({ ...u, include: !!u.player_id })));
      setStage("reviewing");
    } catch (e) {
      setStage("idle");
      notify("Couldn't process that", String(e));
    }
  };

  const toggleInclude = (idx: number) => {
    setUpdates((prev) => prev.map((u, i) => (i === idx ? { ...u, include: !u.include } : u)));
  };

  const confirmAndSave = async () => {
    setStage("saving");
    const toSave = updates.filter((u) => u.include && u.player_id);

    const byPlayer = new Map<string, Update[]>();
    toSave.forEach((u) => {
      const list = byPlayer.get(u.player_id!) ?? [];
      list.push(u);
      byPlayer.set(u.player_id!, list);
    });

    if (!profile?.id) {
      setStage("reviewing");
      notify("Session expired", "Please sign in again before saving evaluations.");
      return;
    }

    const validSkills = [
      "first_touch",
      "ball_control",
      "passing",
      "dribbling",
      "weak_foot",
      "finishing",
      "decision_making",
      "scanning",
      "speed",
      "positioning",
    ] as const;

    let savedCount = 0;

    for (const [playerId, playerUpdates] of byPlayer) {
      // Pull recent evaluations and build the most recent known score for each
      // skill. This prevents an "improved" note from overwriting a 9/10 with
      // an arbitrary 7/10.
      const { data: history, error: historyError } = await supabase
        .from("evaluations")
        .select(validSkills.join(","))
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (historyError) {
        console.error("Failed to load evaluation history:", historyError.message);
      }

      const baseline: Record<string, number> = {};
      for (const row of history ?? []) {
        for (const skill of validSkills) {
          const value = (row as unknown as Record<string, number | null>)[skill];
          if (baseline[skill] == null && typeof value === "number") baseline[skill] = value;
        }
      }

      const skillValues: Record<string, number> = {};
      playerUpdates.forEach((u) => {
        if (!validSkills.includes(u.skill as (typeof validSkills)[number])) return;
        const previous = skillValues[u.skill] ?? baseline[u.skill] ?? 5;
        const delta = u.direction === "up" ? 1 : u.direction === "down" ? -1 : 0;
        skillValues[u.skill] = Math.max(1, Math.min(10, previous + delta));
      });

      if (Object.keys(skillValues).length === 0) continue;

      const combinedNotes = playerUpdates.map((u) => u.note).filter(Boolean).join(" ");
      const { data: evaluation, error } = await supabase
        .from("evaluations")
        .insert({
          player_id: playerId,
          coach_id: profile.id,
          coach_notes: combinedNotes,
          source: "voice",
          ...skillValues,
        })
        .select()
        .single();

      if (error || !evaluation) {
        console.error("Failed to save voice evaluation:", error?.message);
        continue;
      }

      savedCount++;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (accessToken) {
        await fetch(`${SUPABASE_URL}/functions/v1/generate-development-plan`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ evaluation_id: evaluation.id }),
        }).catch(() => {});
      }
    }

    setStage("idle");
    if (savedCount === 0) {
      notify("Nothing saved", "No valid player updates could be saved. Review the matched players and try again.");
      setStage("reviewing");
      return;
    }

    notify("Saved", `Updated ${savedCount} player${savedCount === 1 ? "" : "s"}. New AI plans are drafts until a coach or director publishes them.`);
    goBackOr("/(tabs)/players");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/players")} /> }} />
      {stage === "idle" && (
        <View style={styles.center}>
          <Text style={styles.prompt}>
            Press record and talk through today's practice — mention players by name and what you noticed. Transcription happens
            right on your phone, nothing is uploaded until you confirm.
          </Text>
          <Pressable style={styles.recordButton} onPress={startListening}>
            <Text style={styles.recordButtonText}>🎙️ Start Recording</Text>
          </Pressable>
        </View>
      )}

      {stage === "listening" && (
        <View style={styles.center}>
          <Text style={styles.recordingIndicator}>● Listening…</Text>
          <Text style={styles.liveTranscript}>{transcript || "Start talking…"}</Text>
          <Pressable style={[styles.recordButton, styles.stopButton]} onPress={stopAndExtract}>
            <Text style={styles.recordButtonText}>Stop & Review</Text>
          </Pressable>
        </View>
      )}

      {stage === "extracting" && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0A6CFF" />
          <Text style={styles.prompt}>Matching players and skills…</Text>
        </View>
      )}

      {stage === "reviewing" && (
        <View>
          <Text style={styles.sectionLabel}>TRANSCRIPT</Text>
          <Text style={styles.transcript}>{transcript}</Text>

          <Text style={styles.sectionLabel}>REVIEW UPDATES ({updates.filter((u) => u.include).length} selected)</Text>
          {updates.map((u, idx) => (
            <Pressable
              key={idx}
              style={[styles.updateCard, !u.include && styles.updateCardExcluded]}
              onPress={() => toggleInclude(idx)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.updateName}>
                  {u.player_name} {!u.player_id && <Text style={styles.noMatch}>(no roster match)</Text>}
                </Text>
                <Text style={styles.updateSkill}>
                  {u.skill.replace(/_/g, " ")} {u.direction === "up" ? "↑" : u.direction === "down" ? "↓" : "→"}
                </Text>
                <Text style={styles.updateNote}>{u.note}</Text>
              </View>
              <View style={[styles.checkbox, u.include && styles.checkboxOn]}>{u.include && <Text style={styles.checkmark}>✓</Text>}</View>
            </Pressable>
          ))}

          <Pressable style={styles.button} onPress={confirmAndSave}>
            <Text style={styles.buttonText}>Confirm & Update Players</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={() => setStage("idle")}>
            <Text style={styles.cancelText}>Record Again</Text>
          </Pressable>
        </View>
      )}

      {stage === "saving" && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0A6CFF" />
          <Text style={styles.prompt}>Saving evaluations and generating development plans…</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flexGrow: 1, backgroundColor: "#0B0B0D" },
  center: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 20 },
  prompt: { fontSize: 15, color: "#B5B8BE", textAlign: "center", lineHeight: 21, paddingHorizontal: 10 },
  recordButton: { backgroundColor: "#0A6CFF", borderRadius: 30, paddingVertical: 16, paddingHorizontal: 32 },
  stopButton: { backgroundColor: "#FF453A" },
  recordButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  recordingIndicator: { color: "#FF6B6B", fontWeight: "700", fontSize: 16 },
  liveTranscript: { fontSize: 15, color: "#B5B8BE", textAlign: "center", paddingHorizontal: 16, fontStyle: "italic" },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: "#9A9DA3", marginTop: 16, marginBottom: 8, letterSpacing: 0.5 },
  transcript: { fontSize: 14, color: "#B5B8BE", fontStyle: "italic", backgroundColor: "#141416", padding: 12, borderRadius: 10 },
  updateCard: { flexDirection: "row", backgroundColor: "#141416", borderRadius: 12, padding: 12, marginBottom: 8, alignItems: "center" },
  updateCardExcluded: { opacity: 0.4 },
  updateName: { fontSize: 15, fontWeight: "700", color: "#F2F2F3" },
  noMatch: { fontSize: 12, color: "#FF6B6B", fontWeight: "400" },
  updateSkill: { fontSize: 13, fontWeight: "600", color: "#0A6CFF", textTransform: "capitalize", marginTop: 2 },
  updateNote: { fontSize: 13, color: "#9A9DA3", marginTop: 4 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: "#0A6CFF", alignItems: "center", justifyContent: "center", marginLeft: 10 },
  checkboxOn: { backgroundColor: "#0A6CFF" },
  checkmark: { color: "#fff", fontWeight: "800" },
  button: { backgroundColor: "#0A6CFF", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  cancelButton: { alignItems: "center", padding: 12 },
  cancelText: { color: "#9A9DA3" },
});
