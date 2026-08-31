import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";

interface Metrics {
  totalPlayers: number;
  evaluatedLast7Days: number;
  evaluatedLast30Days: number;
  homeworkCompletionPct: number | null;
  reportViewsLast7Days: number;
  uniqueParentsViewingLast7Days: number;
  evaluationsBySource: { manual: number; voice: number };
}

function StatCard({ big, label, sub }: { big: string; label: string; sub?: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardBig}>{big}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
      {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
    </View>
  );
}

export default function PilotMetrics() {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.club_id) return;
    setLoading(true);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: teams } = await supabase.from("teams").select("id").eq("club_id", profile.club_id);
    const teamIds = (teams ?? []).map((t) => t.id);

    const { data: players } = await supabase
      .from("players")
      .select("id")
      .in("team_id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);
    const playerIds = (players ?? []).map((p) => p.id);
    const totalPlayers = playerIds.length;

    const safePlayerIds = playerIds.length ? playerIds : ["00000000-0000-0000-0000-000000000000"];

    const { data: evals7 } = await supabase
      .from("evaluations")
      .select("player_id, source")
      .in("player_id", safePlayerIds)
      .gte("created_at", sevenDaysAgo);

    const { data: evals30 } = await supabase
      .from("evaluations")
      .select("player_id")
      .in("player_id", safePlayerIds)
      .gte("created_at", thirtyDaysAgo);

    const evaluatedLast7Days = new Set((evals7 ?? []).map((e) => e.player_id)).size;
    const evaluatedLast30Days = new Set((evals30 ?? []).map((e) => e.player_id)).size;
    const evaluationsBySource = { manual: 0, voice: 0 };
    (evals7 ?? []).forEach((e) => {
      if (e.source === "voice") evaluationsBySource.voice++;
      else evaluationsBySource.manual++;
    });

    const { data: homework } = await supabase
      .from("homework_items")
      .select("completed, player_id")
      .in("player_id", safePlayerIds);
    const hwTotal = homework?.length ?? 0;
    const hwDone = (homework ?? []).filter((h) => h.completed).length;

    const { data: views } = await supabase
      .from("report_views")
      .select("player_id, viewer_id")
      .in("player_id", safePlayerIds)
      .gte("created_at", sevenDaysAgo);
    const reportViewsLast7Days = views?.length ?? 0;
    const uniqueParentsViewingLast7Days = new Set((views ?? []).map((v) => v.viewer_id)).size;

    setMetrics({
      totalPlayers,
      evaluatedLast7Days,
      evaluatedLast30Days,
      homeworkCompletionPct: hwTotal ? Math.round((hwDone / hwTotal) * 100) : null,
      reportViewsLast7Days,
      uniqueParentsViewingLast7Days,
      evaluationsBySource,
    });
    setLoading(false);
  }, [profile?.club_id]);

  useEffect(() => {
    load();
  }, [load]);

  if (profile?.role !== "director") {
    return (
      <View style={styles.locked}>
        <Stack.Screen options={{ title: "Pilot Metrics" }} />
        <Text style={styles.lockedText}>Pilot metrics are visible to directors only.</Text>
      </View>
    );
  }

  const evalRate7 = metrics && metrics.totalPlayers ? Math.round((metrics.evaluatedLast7Days / metrics.totalPlayers) * 100) : null;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Stack.Screen options={{ title: "Pilot Metrics" }} />
      <Text style={styles.intro}>
        These are the numbers that actually tell you whether the pilot is working — not whether the features exist,
        whether people are using them.
      </Text>

      {metrics && (
        <>
          <View style={styles.row}>
            <StatCard
              big={evalRate7 !== null ? `${evalRate7}%` : "—"}
              label="Players evaluated (7 days)"
              sub={`${metrics.evaluatedLast7Days} of ${metrics.totalPlayers} players`}
            />
            <StatCard
              big={String(metrics.evaluatedLast30Days)}
              label="Players evaluated (30 days)"
            />
          </View>

          <View style={styles.row}>
            <StatCard
              big={metrics.homeworkCompletionPct !== null ? `${metrics.homeworkCompletionPct}%` : "—"}
              label="Homework completion"
              sub="all-time"
            />
            <StatCard
              big={String(metrics.reportViewsLast7Days)}
              label="Report opens (7 days)"
              sub={`${metrics.uniqueParentsViewingLast7Days} unique parents`}
            />
          </View>

          <View style={styles.sourceCard}>
            <Text style={styles.sourceLabel}>EVALUATIONS THIS WEEK BY METHOD</Text>
            <View style={styles.sourceRow}>
              <Text style={styles.sourceStat}>✍️ Manual: {metrics.evaluationsBySource.manual}</Text>
              <Text style={styles.sourceStat}>🎙️ Voice: {metrics.evaluationsBySource.voice}</Text>
            </View>
            <Text style={styles.sourceHint}>
              If voice evaluations climb relative to manual over time, that's a real signal the friction-reduction is working.
            </Text>
          </View>

          <View style={styles.watchCard}>
            <Text style={styles.watchTitle}>What to actually watch week over week</Text>
            <Text style={styles.watchItem}>• Is the 7-day evaluation rate holding steady or dropping? A drop after week 2-3 is the real adoption test.</Text>
            <Text style={styles.watchItem}>• Are the same coaches evaluating every week, or does it fall off with certain ones?</Text>
            <Text style={styles.watchItem}>• Are report opens coming from the same handful of engaged parents, or spreading?</Text>
            <Text style={styles.watchItem}>• Is homework completion moving at all, or flat regardless of what's assigned?</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0D", padding: 16 },
  locked: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: "#0B0B0D" },
  lockedText: { color: "#9A9DA3", textAlign: "center" },
  intro: { fontSize: 13, color: "#9A9DA3", marginBottom: 16, lineHeight: 18 },
  row: { flexDirection: "row", gap: 12, marginBottom: 12 },
  card: { flex: 1, backgroundColor: "#141416", borderRadius: 14, padding: 16 },
  cardBig: { fontSize: 26, fontWeight: "800", color: "#0A6CFF" },
  cardLabel: { fontSize: 12, color: "#9A9DA3", marginTop: 4, fontWeight: "600" },
  cardSub: { fontSize: 11, color: "#6B6F76", marginTop: 2 },
  sourceCard: { backgroundColor: "#141416", borderRadius: 14, padding: 16, marginBottom: 12 },
  sourceLabel: { fontSize: 11, fontWeight: "700", color: "#9A9DA3", letterSpacing: 0.5, marginBottom: 10 },
  sourceRow: { flexDirection: "row", gap: 20, marginBottom: 8 },
  sourceStat: { fontSize: 14, fontWeight: "600", color: "#F2F2F3" },
  sourceHint: { fontSize: 12, color: "#6B6F76", fontStyle: "italic" },
  watchCard: { backgroundColor: "#17181B", borderRadius: 14, padding: 16, marginBottom: 24 },
  watchTitle: { fontSize: 14, fontWeight: "700", color: "#0A6CFF", marginBottom: 10 },
  watchItem: { fontSize: 13, color: "#B5B8BE", marginBottom: 8, lineHeight: 18 },
});
