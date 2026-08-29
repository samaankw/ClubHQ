import React, { useRef, useState } from "react";
import { View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { supabase, SUPABASE_URL } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";
import { Screen, Card, Text, Eyebrow, Button, Badge } from "@/components/ui";
import { color, space, radius, borderWidth, opacity } from "@/theme";

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
    <Screen>
      <Stack.Screen options={{ headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/players")} /> }} />

      {stage === "idle" && (
        <View style={styles.center}>
          <Text tone="secondary" style={styles.centerText}>
            Press record and talk through today's practice — mention players by name and what you noticed. Transcription happens
            right on your phone, nothing is uploaded until you confirm.
          </Text>
          <Button label="Start Recording" size="lg" onPress={startListening} />
        </View>
      )}

      {stage === "listening" && (
        <View style={styles.center}>
          <Badge label="● Listening…" tone="danger" />
          <Text tone="secondary" style={styles.centerText}>
            {transcript || "Start talking…"}
          </Text>
          <Button label="Stop & Review" size="lg" variant="danger" onPress={stopAndExtract} />
        </View>
      )}

      {stage === "extracting" && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={color.icon.brand} />
          <Text tone="secondary">Matching players and skills…</Text>
        </View>
      )}

      {stage === "reviewing" && (
        <View style={styles.section}>
          <View style={styles.section}>
            <Eyebrow>Transcript</Eyebrow>
            <Card>
              <Text tone="secondary">{transcript}</Text>
            </Card>
          </View>

          <View style={styles.section}>
            <Eyebrow>Review updates ({updates.filter((u) => u.include).length} selected)</Eyebrow>
            {updates.map((u, idx) => (
              <Pressable key={idx} onPress={() => toggleInclude(idx)}>
                <Card style={[styles.updateCard, !u.include && styles.updateCardExcluded]}>
                  <View style={styles.updateCardBody}>
                    <Text role="h3">
                      {u.player_name}{" "}
                      {!u.player_id && (
                        <Text role="bodySm" tone="danger">
                          (no roster match)
                        </Text>
                      )}
                    </Text>
                    <Text role="label" tone="brand">
                      {u.skill.replace(/_/g, " ")} {u.direction === "up" ? "↑" : u.direction === "down" ? "↓" : "→"}
                    </Text>
                    <Text tone="secondary">{u.note}</Text>
                  </View>
                  <View style={[styles.checkbox, u.include && styles.checkboxOn]}>
                    {u.include && <Text role="caption" tone="inverse">✓</Text>}
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>

          <Button label="Confirm & Update Players" size="lg" fullWidth onPress={confirmAndSave} />
          <Button label="Record Again" variant="ghost" onPress={() => setStage("idle")} />
        </View>
      )}

      {stage === "saving" && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={color.icon.brand} />
          <Text tone="secondary">Saving evaluations and generating development plans…</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingTop: space[10], gap: space[5] },
  centerText: { textAlign: "center" },
  section: { gap: space[3] },
  updateCard: { flexDirection: "row", alignItems: "center", gap: space[3] },
  updateCardExcluded: { opacity: opacity.disabled },
  updateCardBody: { flex: 1, gap: space[1] },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    borderWidth: borderWidth.thin,
    borderColor: color.border.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: color.bg.brand },
});
