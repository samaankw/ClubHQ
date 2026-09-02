import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { useVocab } from "@/lib/vocab";
import { Screen, Card, SpotlightCard, Eyebrow, Text, StatTile } from "@/components/ui";
import NotAuthorized from "@/components/NotAuthorized";
import { color, space, radius } from "@/theme";

interface Metrics {
  totalPlayers: number;
  evaluatedLast7Days: number;
  evaluatedLast30Days: number;
  homeworkCompletionPct: number | null;
  reportViewsLast7Days: number;
  uniqueParentsViewingLast7Days: number;
  evaluationsBySource: { manual: number; voice: number };
}

const WATCH_ITEMS = [
  "Is the 7-day evaluation rate holding steady or dropping? A drop after week 2-3 is the real adoption test.",
  "Are the same coaches evaluating every week, or does it fall off with certain ones?",
  "Are report opens coming from the same handful of engaged parents, or spreading?",
  "Is homework completion moving at all, or flat regardless of what's assigned?",
];

/** Two-tone donut, pure Views + rotation — no SVG dependency in this app. */
function UsageDonut({ manual, voice }: { manual: number; voice: number }) {
  const total = manual + voice;
  const voicePct = total > 0 ? (voice / total) * 100 : 0;
  const theta = (Math.max(0, Math.min(100, voicePct)) / 100) * 360;
  const rightIsFull = theta >= 180;
  const rightRotate = theta - 180;
  const leftVisible = theta > 180;
  const leftRotate = theta - 360;

  const diameter = 96;
  const r = diameter / 2;
  const holeD = 52;
  const holeOffset = (diameter - holeD) / 2;

  return (
    <View style={[styles.donut, { width: diameter, height: diameter, borderRadius: r, backgroundColor: color.icon.brand }]}>
      <View
        style={[
          styles.donutHalf,
          { top: 0, left: r, width: r, height: diameter, backgroundColor: rightIsFull ? color.icon.success : color.icon.brand },
        ]}
      >
        {!rightIsFull && theta > 0 && (
          <View
            style={[
              styles.donutWedge,
              {
                width: r,
                height: diameter,
                backgroundColor: color.icon.success,
                borderTopRightRadius: r,
                borderBottomRightRadius: r,
                transform: [{ rotate: `${rightRotate}deg` }],
                transformOrigin: "0% 50%",
              },
            ]}
          />
        )}
      </View>
      {leftVisible && (
        <View style={[styles.donutHalf, { top: 0, left: 0, width: r, height: diameter }]}>
          <View
            style={[
              styles.donutWedge,
              {
                width: r,
                height: diameter,
                backgroundColor: color.icon.success,
                borderTopLeftRadius: r,
                borderBottomLeftRadius: r,
                transform: [{ rotate: `${leftRotate}deg` }],
                transformOrigin: "100% 50%",
              },
            ]}
          />
        </View>
      )}
      <View style={[styles.donutHole, { width: holeD, height: holeD, borderRadius: holeD / 2, top: holeOffset, left: holeOffset }]} />
    </View>
  );
}

export default function PilotMetrics() {
  const { profile } = useAuth();
  const vocab = useVocab();
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

    const { data: homework } = await supabase.from("homework_items").select("completed, player_id").in("player_id", safePlayerIds);
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
      <Screen>
        <Stack.Screen options={{ title: "Pilot Metrics" }} />
        <NotAuthorized title="Directors only" body="Pilot metrics are visible to directors only." fallback="/(tabs)/dashboard" />
      </Screen>
    );
  }

  const evalRate7 = metrics && metrics.totalPlayers ? Math.round((metrics.evaluatedLast7Days / metrics.totalPlayers) * 100) : null;

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: "Pilot Metrics" }} />
      <ScrollView
        contentContainerStyle={{ gap: space[4], paddingBottom: space[4] }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <SpotlightCard style={{ gap: space[2] }}>
          <Eyebrow tone="onSpotlightMuted">Director's Analysis</Eyebrow>
          <Text tone="onSpotlight">
            These are the numbers that actually tell you whether the pilot is working — not whether the features exist, whether people are
            using them.
          </Text>
        </SpotlightCard>

        {metrics && (
          <>
            <View style={styles.row}>
              <StatTile
                label={`${vocab.rosterTitle} evaluated (7d)`}
                value={evalRate7 !== null ? `${evalRate7}%` : "—"}
                footnote={`${metrics.evaluatedLast7Days} of ${metrics.totalPlayers} ${vocab.member.plural.toLowerCase()}`}
              />
              <StatTile label={`${vocab.member.plural} evaluated (30d)`} value={String(metrics.evaluatedLast30Days)} />
            </View>

            <View style={styles.row}>
              <StatTile
                label="Homework completion"
                value={metrics.homeworkCompletionPct !== null ? `${metrics.homeworkCompletionPct}%` : "—"}
                footnote="all-time"
              />
              <StatTile
                label="Report opens (7d)"
                value={String(metrics.reportViewsLast7Days)}
                footnote={`${metrics.uniqueParentsViewingLast7Days} unique parents`}
              />
            </View>

            <Card style={{ gap: space[3] }}>
              <Eyebrow>Usage Mix</Eyebrow>
              <View style={styles.usageRow}>
                <UsageDonut manual={metrics.evaluationsBySource.manual} voice={metrics.evaluationsBySource.voice} />
                <View style={styles.legend}>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: color.icon.brand }]} />
                    <Text role="h3" style={{ flex: 1 }}>
                      Manual
                    </Text>
                    <Text tone="secondary">{metrics.evaluationsBySource.manual}</Text>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: color.icon.success }]} />
                    <Text role="h3" style={{ flex: 1 }}>
                      Voice
                    </Text>
                    <Text tone="secondary">{metrics.evaluationsBySource.voice}</Text>
                  </View>
                </View>
              </View>
              <Text role="caption" tone="tertiary" style={{ fontStyle: "italic" }}>
                If voice evaluations climb relative to manual over time, that's a real signal the friction-reduction is working.
              </Text>
            </Card>

            <Card style={{ gap: space[2] }}>
              <Eyebrow>What to Watch</Eyebrow>
              <Text role="h3">What to actually watch week over week</Text>
              <View style={{ gap: space[2] }}>
                {WATCH_ITEMS.map((item) => (
                  <Text key={item} tone="secondary" role="bodySm">
                    • {item}
                  </Text>
                ))}
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space[3] },
  usageRow: { flexDirection: "row", alignItems: "center", gap: space[4] },
  legend: { flex: 1, gap: space[3] },
  legendRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  legendDot: { width: space[3], height: space[3], borderRadius: radius.full },
  donut: { position: "relative", overflow: "hidden" },
  donutHalf: { position: "absolute", overflow: "hidden" },
  donutWedge: { position: "absolute", top: 0, left: 0 },
  donutHole: { position: "absolute", backgroundColor: color.bg.surface },
});
