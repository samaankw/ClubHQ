import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Player, DevelopmentPlan, HomeworkItem, Drill, Evaluation } from "@/types/db";
import { confirmAsync, notify } from "@/lib/alertCompat";
import DrillVideoModal from "@/components/DrillVideoModal";

const SKILLS: (keyof Pick<Evaluation, "first_touch" | "ball_control" | "passing" | "dribbling" | "weak_foot" | "finishing" | "decision_making" | "scanning" | "speed" | "positioning">)[] = [
  "first_touch", "ball_control", "passing", "dribbling", "weak_foot", "finishing", "decision_making", "scanning", "speed", "positioning",
];

function overallScore(e: Evaluation) {
  const values = SKILLS.map((skill) => e[skill]).filter((v): v is number => typeof v === "number");
  return values.length ? Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10 : null;
}

export default function PlayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [plan, setPlan] = useState<DevelopmentPlan | null>(null);
  const [homework, setHomework] = useState<(HomeworkItem & { drill?: Drill | null })[]>([]);
  const [pastPlans, setPastPlans] = useState<(DevelopmentPlan & { homework: (HomeworkItem & { drill?: Drill | null })[] })[]>([]);
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(new Set());
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [watchingDrill, setWatchingDrill] = useState<(HomeworkItem & { drill?: Drill | null }) | null>(null);
  const isStaff = profile?.role === "coach" || profile?.role === "director";
  const isLinkedParent = profile?.role === "parent" && player?.parent_id === profile.id;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: playerData, error: playerError } = await supabase.from("players").select("*").eq("id", id).single();
    if (playerError || !playerData) {
      setLoading(false);
      return;
    }
    setPlayer(playerData as Player);

    // Homework used to only ever load from the single latest plan — once a
    // new plan generated, every prior week's drills (and their videos)
    // simply vanished with no way back to them. Loading every plan with its
    // homework in one shot lets the current week stay front-and-center while
    // everything before it becomes browsable history instead of disappearing.
    const [{ data: allPlansData }, { data: evaluationData }] = await Promise.all([
      supabase
        .from("development_plans")
        .select("*, homework_items(*, drills(*))")
        .eq("player_id", id)
        .order("week_start", { ascending: false })
        .order("day_of_week", { ascending: true, foreignTable: "homework_items" }),
      supabase.from("evaluations").select("*").eq("player_id", id).order("created_at", { ascending: false }).limit(8),
    ]);
    setEvaluations((evaluationData as Evaluation[]) ?? []);

    const allPlans = (allPlansData as any[]) ?? [];
    const [latestPlan, ...restPlans] = allPlans;
    const mapHomework = (items: any[] | null | undefined) =>
      (items ?? []).map((h) => ({ ...h, drill: h.drills as Drill | null }));

    setPlan((latestPlan as DevelopmentPlan) ?? null);
    setHomework(latestPlan ? mapHomework(latestPlan.homework_items) : []);
    setPastPlans(restPlans.map((p) => ({ ...(p as DevelopmentPlan), homework: mapHomework(p.homework_items) })));

    if (latestPlan && profile?.id && profile.role === "parent") {
      void supabase.from("report_views").insert({ player_id: id, viewer_id: profile.id });
    }
    setLoading(false);
  }, [id, profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  const toggleHomework = async (item: HomeworkItem) => {
    if (!isLinkedParent) return;
    const nextCompleted = !item.completed;
    const previousHomework = homework;
    const previousPastPlans = pastPlans;

    // Homework can now come from the current plan or a past one — update
    // whichever collection actually holds this item.
    if (homework.some((h) => h.id === item.id)) {
      setHomework((prev) => prev.map((h) => (h.id === item.id ? { ...h, completed: nextCompleted } : h)));
    } else {
      setPastPlans((prev) =>
        prev.map((p) => ({ ...p, homework: p.homework.map((h) => (h.id === item.id ? { ...h, completed: nextCompleted } : h)) }))
      );
    }

    const { error } = await supabase.from("homework_items").update({ completed: nextCompleted, completed_at: nextCompleted ? new Date().toISOString() : null }).eq("id", item.id);
    if (error) {
      setHomework(previousHomework);
      setPastPlans(previousPastPlans);
      notify("Couldn't update homework", error.message);
    }
  };

  const togglePastPlan = (planId: string) => {
    setExpandedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const renderHomeworkRow = (h: HomeworkItem & { drill?: Drill | null }) => (
    <Pressable key={h.id} disabled={!isLinkedParent} onPress={() => toggleHomework(h)} style={styles.hwRow}>
      <View style={[styles.checkbox, h.completed && styles.checkboxDone]}>{h.completed && <Text style={styles.checkmark}>✓</Text>}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.hwDay}>{h.day_of_week}</Text>
        <Text style={[styles.hwTitle, h.completed && styles.hwTitleDone]}>{h.title}</Text>
        {h.description ? <Text style={styles.hwDesc}>{h.description}</Text> : null}
        {h.drill?.video_url ? <Pressable onPress={() => setWatchingDrill(h)} style={styles.watchButton}><Text style={styles.watchButtonText}>▶ Watch drill video</Text></Pressable> : null}
      </View>
    </Pressable>
  );

  const reviewPlan = async (publish: boolean) => {
    if (!plan) return;
    setPublishing(true);
    const { error } = await supabase.rpc("review_development_plan", { p_plan_id: plan.id, p_publish: publish });
    setPublishing(false);
    if (error) return notify("Couldn't update plan", error.message);
    notify(publish ? "Plan published" : "Plan reviewed", publish ? "The linked parent can now see this development plan." : "The plan is marked coach-reviewed but is still hidden from parents.");
    await load();
  };

  const completionPct = homework.length ? Math.round((homework.filter((h) => h.completed).length / homework.length) * 100) : 0;
  const trend = useMemo(() => [...evaluations].reverse().map((evaluation) => ({ ...evaluation, score: overallScore(evaluation) })), [evaluations]);

  if (loading || !player) return <View style={styles.centered}><Text style={{ color: "#9A9DA3" }}>Loading…</Text></View>;

  const deletePlayerData = async () => {
    const { error } = await supabase.rpc("delete_player_data", {
      p_player_id: id,
    });

    if (error) {
      notify("Couldn't delete", error.message);
      return;
    }

    notify("Deleted", `${player.full_name}'s data has been permanently deleted.`);
    router.replace("/players");
  };

  const confirmDeletePlayer = async () => {
    const ok = await confirmAsync(
      `Delete ${player.full_name}'s data?`,
      "This permanently removes the player record, evaluations, development plans, homework, and linked history. This cannot be undone.",
      "Delete"
    );
    if (ok) await deletePlayerData();
  };

  return (
    <>
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: player.full_name }} />

      <View style={styles.identityCard}>
        <Text style={styles.playerName}>{player.full_name}</Text>
        <Text style={styles.playerMeta}>{player.position || "Position not set"}</Text>
      </View>

      {evaluations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>DEVELOPMENT HISTORY</Text>
          {trend.map((evaluation, index) => (
            <View key={evaluation.id} style={styles.historyRow}>
              <Text style={styles.historyDate}>{format(new Date(evaluation.created_at), "MMM d")}</Text>
              <View style={styles.historyTrack}><View style={[styles.historyFill, { width: `${Math.max(0, Math.min(100, (evaluation.score ?? 0) * 10))}%` }]} /></View>
              <Text style={styles.historyScore}>{evaluation.score ?? "—"}</Text>
              {index > 0 && trend[index - 1].score != null && evaluation.score != null ? <Text style={styles.historyDelta}>{evaluation.score! - trend[index - 1].score! > 0 ? "↑" : evaluation.score! - trend[index - 1].score! < 0 ? "↓" : "→"}</Text> : <Text style={styles.historyDelta}>·</Text>}
            </View>
          ))}
          <Text style={styles.historyHint}>Average of scored evaluation categories. Individual skill scores remain available to coaches in each evaluation record.</Text>
        </View>
      )}

      {plan ? (
        <>
          <View style={styles.scoreCard}>
            <View style={styles.statusRow}>
              <Text style={styles.scoreLabel}>OVERALL DEVELOPMENT</Text>
              {isStaff && <Text style={styles.statusBadge}>{plan.status.replace("_", " ").toUpperCase()}</Text>}
            </View>
            <Text style={styles.scoreBig}>{plan.overall_score_before ?? "—"} → {plan.overall_score_after ?? "—"}</Text>
            <Text style={styles.dated}>Week of {format(new Date(plan.week_start), "MMM d")}</Text>
          </View>

          {isStaff && plan.status !== "published" && (
            <View style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>Coach review required</Text>
              <Text style={styles.reviewBody}>AI created this as a draft. Check the priorities and homework before releasing it to the parent.</Text>
              <View style={styles.reviewActions}>
                <Pressable style={styles.secondaryButton} onPress={() => reviewPlan(false)} disabled={publishing}><Text style={styles.secondaryText}>Mark Reviewed</Text></Pressable>
                <Pressable style={styles.publishButton} onPress={() => reviewPlan(true)} disabled={publishing}><Text style={styles.publishText}>{publishing ? "Saving…" : "Review & Publish"}</Text></Pressable>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>COACH HIGHLIGHT</Text>
            <Text style={styles.body}>{plan.summary}</Text>
            <Text style={styles.aiDisclosure}>✨ AI-assisted draft based on coach-entered evaluation data. A coach/director controls publication.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>CURRENT PRIORITIES</Text>
            {(plan.priorities ?? []).map((p, idx) => (
              <View key={`${p.skill}-${idx}`} style={styles.priorityRow}><Text style={styles.priorityNum}>{idx + 1}</Text><View style={{ flex: 1 }}><Text style={styles.prioritySkill}>{p.skill.replace(/_/g, " ")}</Text><Text style={styles.priorityNote}>{p.note}</Text></View></View>
            ))}
          </View>

          <View style={styles.card}>
            <View style={styles.homeworkHeader}><Text style={styles.cardLabel}>THIS WEEK'S HOMEWORK</Text><Text style={styles.pct}>{completionPct}% done</Text></View>
            {homework.length === 0 ? <Text style={styles.body}>No homework items attached to this plan.</Text> : homework.map(renderHomeworkRow)}
            {isStaff && <Text style={styles.historyHint}>Homework completion is parent-controlled in this build.</Text>}
          </View>

          {pastPlans.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>PAST HOMEWORK</Text>
              {pastPlans.map((pp) => {
                const pastPct = pp.homework.length ? Math.round((pp.homework.filter((h) => h.completed).length / pp.homework.length) * 100) : 0;
                const isExpanded = expandedPlanIds.has(pp.id);
                return (
                  <View key={pp.id} style={styles.pastWeekBlock}>
                    <Pressable onPress={() => togglePastPlan(pp.id)} style={styles.pastWeekHeader}>
                      <Text style={styles.pastWeekLabel}>Week of {format(new Date(pp.week_start), "MMM d")}</Text>
                      <Text style={styles.pastWeekPct}>{pastPct}% done  {isExpanded ? "▲" : "▼"}</Text>
                    </Pressable>
                    {isExpanded && (
                      pp.homework.length === 0
                        ? <Text style={styles.body}>No homework items attached to this plan.</Text>
                        : pp.homework.map(renderHomeworkRow)
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <View style={styles.card}><Text style={styles.body}>{isStaff ? `No development plan yet. Evaluate ${player.full_name} to create a coach-reviewable AI draft.` : "No published development plan yet."}</Text></View>
      )}

      {(profile?.role === "director" || isLinkedParent) && (
        <View style={styles.dangerCard}>
          <Text style={styles.dangerLabel}>DATA & PRIVACY</Text>
          <Text style={styles.dangerBody}>Permanently delete {player.full_name}'s player record, evaluations, development plans, homework, and linked history. This can't be undone.</Text>
          <Pressable
  style={styles.dangerButton}
  onPress={confirmDeletePlayer}
>
  <Text style={styles.dangerButtonText}>
    Delete {player.full_name}'s Data
  </Text>
</Pressable>
        </View>
      )}
    </ScrollView>
    <DrillVideoModal
      visible={!!watchingDrill}
      onClose={() => setWatchingDrill(null)}
      videoUrl={watchingDrill?.drill?.video_url ?? null}
      title={watchingDrill?.drill?.title}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0D", padding: 16 }, centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B0B0D" },
  identityCard: { marginBottom: 14 }, playerName: { fontSize: 24, fontWeight: "800", color: "#F2F2F3" }, playerMeta: { color: "#9A9DA3", marginTop: 3 },
  scoreCard: { backgroundColor: "#0A6CFF", borderRadius: 14, padding: 20, marginBottom: 14 }, statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, statusBadge: { color: "#0A6CFF", backgroundColor: "#fff", borderRadius: 10, overflow: "hidden", paddingVertical: 3, paddingHorizontal: 7, fontSize: 9, fontWeight: "800" },
  scoreLabel: { fontSize: 12, fontWeight: "700", color: "#CFE0F0", letterSpacing: 0.5, marginBottom: 6 }, scoreBig: { fontSize: 30, fontWeight: "800", color: "#fff" }, dated: { color: "#CFE0F0", marginTop: 6, fontSize: 12 },
  card: { backgroundColor: "#141416", borderRadius: 14, padding: 16, marginBottom: 14 }, cardLabel: { fontSize: 12, fontWeight: "700", color: "#9A9DA3", letterSpacing: 0.5, marginBottom: 8 }, body: { fontSize: 15, color: "#B5B8BE", lineHeight: 21 },
  reviewCard: { backgroundColor: "#2A2410", borderRadius: 14, padding: 16, marginBottom: 14 }, reviewTitle: { fontSize: 15, fontWeight: "800", color: "#F5D061" }, reviewBody: { fontSize: 13, lineHeight: 18, color: "#D4C486", marginTop: 5 }, reviewActions: { flexDirection: "row", gap: 8, marginTop: 12 }, secondaryButton: { flex: 1, borderWidth: 1, borderColor: "#0A6CFF", borderRadius: 9, padding: 10, alignItems: "center" }, secondaryText: { color: "#0A6CFF", fontWeight: "700", fontSize: 12 }, publishButton: { flex: 1, backgroundColor: "#0A6CFF", borderRadius: 9, padding: 10, alignItems: "center" }, publishText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  priorityRow: { flexDirection: "row", gap: 10, marginBottom: 10, alignItems: "flex-start" }, priorityNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#0A6CFF", color: "#fff", textAlign: "center", fontSize: 12, fontWeight: "700", lineHeight: 22 }, prioritySkill: { fontSize: 15, fontWeight: "700", color: "#F2F2F3", textTransform: "capitalize" }, priorityNote: { fontSize: 13, color: "#9A9DA3", marginTop: 2 },
  homeworkHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }, pct: { fontSize: 13, fontWeight: "700", color: "#0A6CFF" }, hwRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#242424" }, checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#0A6CFF", alignItems: "center", justifyContent: "center", marginTop: 2 }, checkboxDone: { backgroundColor: "#0A6CFF" }, checkmark: { color: "#fff", fontSize: 13, fontWeight: "800" }, hwDay: { fontSize: 11, fontWeight: "700", color: "#0A6CFF" }, hwTitle: { fontSize: 15, fontWeight: "700", color: "#F2F2F3" }, hwTitleDone: { textDecorationLine: "line-through", color: "#6B6F76" }, hwDesc: { fontSize: 13, color: "#9A9DA3", marginTop: 2 }, watchButton: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#17181B", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }, watchButtonText: { color: "#0A6CFF", fontWeight: "700", fontSize: 13 },
  pastWeekBlock: { borderTopWidth: 1, borderTopColor: "#242424", paddingTop: 4 },
  pastWeekHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  pastWeekLabel: { fontSize: 14, fontWeight: "700", color: "#F2F2F3" },
  pastWeekPct: { fontSize: 12, fontWeight: "700", color: "#9A9DA3" },
  aiDisclosure: { fontSize: 11, color: "#6B6F76", marginTop: 10, fontStyle: "italic" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 6 }, historyDate: { width: 43, fontSize: 11, color: "#9A9DA3" }, historyTrack: { flex: 1, height: 8, backgroundColor: "#1C1D20", borderRadius: 4, overflow: "hidden" }, historyFill: { height: 8, backgroundColor: "#0A6CFF", borderRadius: 4 }, historyScore: { width: 28, textAlign: "right", fontWeight: "800", color: "#0A6CFF", fontSize: 12 }, historyDelta: { width: 14, color: "#30D158" }, historyHint: { color: "#6B6F76", fontSize: 10, lineHeight: 14, marginTop: 8 },
  dangerCard: { backgroundColor: "#2A1614", borderRadius: 14, padding: 16, marginTop: 8, marginBottom: 30 }, dangerLabel: { fontSize: 11, fontWeight: "700", color: "#FF6B6B", letterSpacing: 0.5, marginBottom: 8 }, dangerBody: { fontSize: 13, color: "#E0A199", lineHeight: 18, marginBottom: 12 }, dangerButton: { backgroundColor: "#FF453A", borderRadius: 10, padding: 12, alignItems: "center" }, dangerButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});