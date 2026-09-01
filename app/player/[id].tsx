import React, { useMemo, useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Player, DevelopmentPlan, HomeworkItem, Drill, Evaluation } from "@/types/db";
import { confirmAsync, notify } from "@/lib/alertCompat";
import DrillVideoModal from "@/components/DrillVideoModal";
import { useAsyncData } from "@/lib/asyncData";
import ListState from "@/components/ListState";
import { Screen, Card, SpotlightCard, AICard, Text, Eyebrow, Button, Badge, Avatar, ProgressBar, EmptyState } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

const SKILLS: (keyof Pick<
  Evaluation,
  | "first_touch"
  | "ball_control"
  | "passing"
  | "dribbling"
  | "weak_foot"
  | "finishing"
  | "decision_making"
  | "scanning"
  | "speed"
  | "positioning"
>)[] = [
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
];

function overallScore(e: Evaluation) {
  const values = SKILLS.map((skill) => e[skill]).filter((v): v is number => typeof v === "number");
  return values.length ? Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10 : null;
}

// The mockups show Goals / Assists / Matches / Rating for the profile's 2x2
// stat grid — none of those exist in the schema (no match log, no box score).
// Per the 2026-08-29 "reskin what exists" decision, these four tiles instead
// group the ten REAL evaluation skills into the same 2x2 shape: six technical
// skills averaged, the two game-reading skills averaged, and the two solo
// physical/tactical skills on their own. No fictional data anywhere here.
const STAT_GROUPS: { label: string; skills: (keyof Evaluation)[] }[] = [
  { label: "Technical", skills: ["first_touch", "ball_control", "passing", "dribbling", "weak_foot", "finishing"] },
  { label: "Game IQ", skills: ["decision_making", "scanning"] },
  { label: "Speed", skills: ["speed"] },
  { label: "Positioning", skills: ["positioning"] },
];

function groupAverage(e: Evaluation, skills: (keyof Evaluation)[]): number | null {
  const values = skills.map((s) => e[s]).filter((v): v is number => typeof v === "number");
  return values.length ? Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10 : null;
}

type HomeworkWithDrill = HomeworkItem & { drill?: Drill | null };
type PastPlan = DevelopmentPlan & { homework: HomeworkWithDrill[] };
type RawPlanRow = DevelopmentPlan & { homework_items: (HomeworkItem & { drills: Drill | null })[] | null };

interface PlayerDetailData {
  player: Player;
  plan: DevelopmentPlan | null;
  homework: HomeworkWithDrill[];
  pastPlans: PastPlan[];
  evaluations: Evaluation[];
}

export default function PlayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [watchingDrill, setWatchingDrill] = useState<HomeworkWithDrill | null>(null);

  const {
    data,
    loading,
    error,
    retry: load,
    setData,
  } = useAsyncData<PlayerDetailData | null>(
    async () => {
      if (!id) return null;
      const { data: playerData, error: playerError } = await supabase.from("players").select("*").eq("id", id).single();
      if (playerError) throw playerError;
      if (!playerData) throw { message: "Player not found." };

      // Homework used to only ever load from the single latest plan — once a
      // new plan generated, every prior week's drills (and their videos)
      // simply vanished with no way back to them. Loading every plan with its
      // homework in one shot lets the current week stay front-and-center while
      // everything before it becomes browsable history instead of disappearing.
      const [{ data: allPlansData, error: plansError }, { data: evaluationData, error: evalError }] = await Promise.all([
        supabase
          .from("development_plans")
          .select("*, homework_items(*, drills(*))")
          .eq("player_id", id)
          .order("week_start", { ascending: false })
          .order("day_of_week", { ascending: true, foreignTable: "homework_items" }),
        supabase.from("evaluations").select("*").eq("player_id", id).order("created_at", { ascending: false }).limit(8),
      ]);
      if (plansError) throw plansError;
      if (evalError) throw evalError;

      const allPlans = (allPlansData as RawPlanRow[] | null) ?? [];
      const [latestPlan, ...restPlans] = allPlans;
      const mapHomework = (items: (HomeworkItem & { drills: Drill | null })[] | null): HomeworkWithDrill[] =>
        (items ?? []).map((h) => ({ ...h, drill: h.drills }));

      if (latestPlan && profile?.id && profile.role === "parent") {
        void supabase.from("report_views").insert({ player_id: id, viewer_id: profile.id });
      }

      return {
        player: playerData as Player,
        plan: latestPlan ?? null,
        homework: latestPlan ? mapHomework(latestPlan.homework_items) : [],
        pastPlans: restPlans.map((p) => ({ ...p, homework: mapHomework(p.homework_items) })),
        evaluations: (evaluationData as Evaluation[]) ?? [],
      };
    },
    [id, profile?.id, profile?.role],
    null,
  );

  const evaluations = data?.evaluations ?? [];
  const trend = useMemo(
    () => [...evaluations].reverse().map((evaluation) => ({ ...evaluation, score: overallScore(evaluation) })),
    [evaluations],
  );

  if (loading || error || !data) {
    return (
      <Screen>
        <ListState loading={loading} error={error} isEmpty={!loading && !error} onRetry={load} emptyTitle="Player not found." />
      </Screen>
    );
  }

  const { player, plan, homework, pastPlans } = data;
  const isStaff = profile?.role === "coach" || profile?.role === "director";
  const isLinkedParent = profile?.role === "parent" && player.parent_id === profile.id;
  const latestEvaluation = evaluations[0];

  const toggleHomework = async (item: HomeworkItem) => {
    if (!isLinkedParent) return;
    const nextCompleted = !item.completed;
    const previous = data;

    // Homework can now come from the current plan or a past one — update
    // whichever collection actually holds this item.
    setData((prev) => {
      if (!prev) return prev;
      if (prev.homework.some((h) => h.id === item.id)) {
        return { ...prev, homework: prev.homework.map((h) => (h.id === item.id ? { ...h, completed: nextCompleted } : h)) };
      }
      return {
        ...prev,
        pastPlans: prev.pastPlans.map((p) => ({
          ...p,
          homework: p.homework.map((h) => (h.id === item.id ? { ...h, completed: nextCompleted } : h)),
        })),
      };
    });

    const { error } = await supabase
      .from("homework_items")
      .update({ completed: nextCompleted, completed_at: nextCompleted ? new Date().toISOString() : null })
      .eq("id", item.id);
    if (error) {
      setData(previous);
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

  const renderHomeworkRow = (h: HomeworkWithDrill) => (
    <Pressable
      key={h.id}
      disabled={!isLinkedParent}
      onPress={() => toggleHomework(h)}
      accessibilityRole={isLinkedParent ? "checkbox" : undefined}
      accessibilityState={isLinkedParent ? { checked: h.completed } : undefined}
      accessibilityLabel={h.title}
      style={styles.hwRow}
    >
      <View style={[styles.checkbox, h.completed && styles.checkboxDone]}>
        {h.completed && <Ionicons name="checkmark" size={13} color={color.icon.inverse} />}
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        {h.day_of_week ? <Eyebrow tone="brand">{h.day_of_week}</Eyebrow> : null}
        <Text role="h3" tone={h.completed ? "tertiary" : "primary"} style={h.completed ? styles.strike : undefined}>
          {h.title}
        </Text>
        {h.description ? (
          <Text tone="secondary" role="bodySm">
            {h.description}
          </Text>
        ) : null}
        {h.drill?.video_url ? (
          <Button
            label="Watch Drill Video"
            variant="ghost"
            size="sm"
            left={<Ionicons name="play" size={14} color={color.icon.brand} />}
            onPress={() => setWatchingDrill(h)}
          />
        ) : null}
      </View>
    </Pressable>
  );

  const reviewPlan = async (publish: boolean) => {
    if (!plan) return;
    setPublishing(true);
    const { error } = await supabase.rpc("review_development_plan", { p_plan_id: plan.id, p_publish: publish });
    setPublishing(false);
    if (error) return notify("Couldn't update plan", error.message);
    notify(
      publish ? "Plan published" : "Plan reviewed",
      publish
        ? "The linked parent can now see this development plan."
        : "The plan is marked coach-reviewed but is still hidden from parents.",
    );
    await load();
  };

  const completionPct = homework.length ? Math.round((homework.filter((h) => h.completed).length / homework.length) * 100) : 0;

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
      "Delete",
    );
    if (ok) await deletePlayerData();
  };

  // Three role-and-state variants of this one route (mockups 02/03/04):
  // a plain player-profile view (anyone, no draft in flight), a staff
  // "AI generated analysis" review view (unpublished plan), and a parent
  // "new development plan" view (published plan). Which the viewer sees
  // is driven entirely by isStaff/isLinkedParent and plan.status below —
  // a parent never sees the AI-review affordances, matching the RLS rule
  // that a draft plan doesn't exist for them at all.
  const needsStaffReview = isStaff && plan && plan.status !== "published";
  const showParentHeadline = isLinkedParent && plan;

  return (
    <>
      <Screen>
        <Stack.Screen options={{ title: player.full_name }} />

        <SpotlightCard style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <Avatar name={player.full_name} uri={player.photo_url} size={64} />
          <View style={{ flex: 1, gap: space[1] }}>
            <Text role="h1" tone="onSpotlight">
              {player.full_name}
            </Text>
            <Text tone="onSpotlightMuted">{player.position || "Position not set"}</Text>
          </View>
        </SpotlightCard>

        {latestEvaluation && (
          <View style={{ gap: space[3] }}>
            <View style={{ flexDirection: "row", gap: space[3] }}>
              {STAT_GROUPS.slice(0, 2).map((g) => (
                <View key={g.label} style={{ flex: 1 }}>
                  <StatTileValue label={g.label} value={groupAverage(latestEvaluation, g.skills)} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: space[3] }}>
              {STAT_GROUPS.slice(2, 4).map((g) => (
                <View key={g.label} style={{ flex: 1 }}>
                  <StatTileValue label={g.label} value={groupAverage(latestEvaluation, g.skills)} />
                </View>
              ))}
            </View>
          </View>
        )}

        {evaluations.length > 0 && (
          <Card style={{ gap: space[3] }}>
            <Eyebrow>Development History</Eyebrow>
            {trend.map((evaluation, index) => {
              const prevScore = index > 0 ? trend[index - 1].score : null;
              const delta = evaluation.score != null && prevScore != null ? evaluation.score - prevScore : null;
              return (
                <View key={evaluation.id} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  <Text role="caption" tone="secondary" style={{ width: 46 }}>
                    {format(new Date(evaluation.created_at), "MMM d")}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <ProgressBar value={(evaluation.score ?? 0) / 10} />
                  </View>
                  <Text role="label" tone="brand" style={{ width: 28, textAlign: "right" }}>
                    {evaluation.score ?? "—"}
                  </Text>
                  {delta != null ? (
                    <Ionicons
                      name={delta > 0 ? "arrow-up" : delta < 0 ? "arrow-down" : "remove"}
                      size={14}
                      color={delta > 0 ? color.icon.success : delta < 0 ? color.icon.danger : color.icon.muted}
                    />
                  ) : (
                    <View style={{ width: 14 }} />
                  )}
                </View>
              );
            })}
            <Text role="caption" tone="tertiary">
              Average of scored evaluation categories. Individual skill scores remain available to coaches in each evaluation record.
            </Text>
          </Card>
        )}

        {plan ? (
          <>
            <Card style={{ gap: space[2] }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Eyebrow>Overall Development</Eyebrow>
                {isStaff && <Badge label={plan.status.replace("_", " ")} tone={plan.status === "published" ? "success" : "warning"} />}
              </View>
              <Text role="display" tone="brand">
                {plan.overall_score_before ?? "—"} → {plan.overall_score_after ?? "—"}
              </Text>
              <Text tone="secondary">Week of {format(new Date(plan.week_start), "MMM d")}</Text>
            </Card>

            {needsStaffReview ? (
              <AICard style={{ gap: space[3] }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  <Ionicons name="sparkles" size={14} color={color.icon.inverse} />
                  <Eyebrow tone="onSpotlightMuted">AI Generated Analysis</Eyebrow>
                </View>
                <Text role="h2" tone="onSpotlight">
                  Coach review required
                </Text>
                <Text tone="onSpotlightMuted">{plan.summary}</Text>
                <View style={{ flexDirection: "row", gap: space[2] }}>
                  <View style={{ flex: 1 }}>
                    <Button label="Mark Reviewed" variant="secondary" fullWidth onPress={() => reviewPlan(false)} disabled={publishing} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={publishing ? "Saving…" : "Publish to Parent"}
                      fullWidth
                      onPress={() => reviewPlan(true)}
                      disabled={publishing}
                    />
                  </View>
                </View>
              </AICard>
            ) : showParentHeadline ? (
              <AICard style={{ gap: space[2] }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  <Ionicons name="sparkles" size={14} color={color.icon.inverse} />
                  <Eyebrow tone="onSpotlightMuted">New Development Plan</Eyebrow>
                </View>
                <Text tone="onSpotlight">{plan.summary}</Text>
                <Text role="caption" tone="onSpotlightMuted">
                  AI-assisted draft based on coach-entered evaluation data. A coach/director controls publication.
                </Text>
                <Button
                  label="Message Coach"
                  variant="secondary"
                  left={<Ionicons name="chatbubble" size={16} color={color.icon.default} />}
                  onPress={() => router.push("/(tabs)/messages")}
                />
              </AICard>
            ) : (
              <Card style={{ gap: space[2] }}>
                <Eyebrow>Coach Highlight</Eyebrow>
                <Text tone="secondary">{plan.summary}</Text>
                <Text role="caption" tone="tertiary">
                  AI-assisted draft based on coach-entered evaluation data. A coach/director controls publication.
                </Text>
              </Card>
            )}

            <Card style={{ gap: space[3] }}>
              <Eyebrow>Current Priorities</Eyebrow>
              {(plan.priorities ?? []).map((p, idx) => (
                <View key={`${p.skill}-${idx}`} style={{ flexDirection: "row", gap: space[3], alignItems: "flex-start" }}>
                  <Badge label={String(idx + 1)} tone="brand" />
                  <View style={{ flex: 1, gap: space[1] }}>
                    <Text role="h3" style={{ textTransform: "capitalize" }}>
                      {p.skill.replace(/_/g, " ")}
                    </Text>
                    <Text tone="secondary" role="bodySm">
                      {p.note}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>

            <Card style={{ gap: space[3] }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Eyebrow>This Week's Homework</Eyebrow>
                <Text role="label" tone="brand">
                  {completionPct}% done
                </Text>
              </View>
              <ProgressBar value={completionPct / 100} />
              {homework.length === 0 ? (
                <Text tone="secondary">No homework items attached to this plan.</Text>
              ) : (
                homework.map(renderHomeworkRow)
              )}
              {isStaff && (
                <Text role="caption" tone="tertiary">
                  Homework completion is parent-controlled in this build.
                </Text>
              )}
            </Card>

            {pastPlans.length > 0 && (
              <Card style={{ gap: space[1] }}>
                <Eyebrow>Past Homework</Eyebrow>
                {pastPlans.map((pp) => {
                  const pastPct = pp.homework.length
                    ? Math.round((pp.homework.filter((h) => h.completed).length / pp.homework.length) * 100)
                    : 0;
                  const isExpanded = expandedPlanIds.has(pp.id);
                  return (
                    <View key={pp.id} style={{ gap: space[2] }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Week of ${format(new Date(pp.week_start), "MMM d")}, ${pastPct}% done`}
                        onPress={() => togglePastPlan(pp.id)}
                        style={styles.pastWeekHeader}
                      >
                        <Text role="h3">Week of {format(new Date(pp.week_start), "MMM d")}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
                          <Text role="label" tone="secondary">
                            {pastPct}% done
                          </Text>
                          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={color.icon.muted} />
                        </View>
                      </Pressable>
                      {isExpanded &&
                        (pp.homework.length === 0 ? (
                          <Text tone="secondary">No homework items attached to this plan.</Text>
                        ) : (
                          pp.homework.map(renderHomeworkRow)
                        ))}
                    </View>
                  );
                })}
              </Card>
            )}
          </>
        ) : (
          <Card>
            <Text tone="secondary">
              {isStaff
                ? `No development plan yet. Evaluate ${player.full_name} to create a coach-reviewable AI draft.`
                : "No published development plan yet."}
            </Text>
          </Card>
        )}

        {evaluations.length === 0 && !plan && (
          <EmptyState
            icon="stats-chart"
            title="No evaluations yet"
            body="Once a coach logs an evaluation, this player's development profile appears here."
          />
        )}

        {(profile?.role === "director" || isLinkedParent) && (
          <Card style={{ gap: space[2] }}>
            <Eyebrow tone="danger">Data &amp; Privacy</Eyebrow>
            <Text tone="secondary">
              Permanently delete {player.full_name}'s player record, evaluations, development plans, homework, and linked history. This
              can't be undone.
            </Text>
            <Button label={`Delete ${player.full_name}'s Data`} variant="danger" fullWidth onPress={confirmDeletePlayer} />
          </Card>
        )}
      </Screen>
      <DrillVideoModal
        visible={!!watchingDrill}
        onClose={() => setWatchingDrill(null)}
        videoUrl={watchingDrill?.drill?.video_url ?? null}
        title={watchingDrill?.drill?.title}
      />
    </>
  );
}

/** Label-over-number stat tile fed by a group average of real evaluation
 * skills (see STAT_GROUPS) rather than the mockup's fictional match stats. */
function StatTileValue({ label, value }: { label: string; value: number | null }) {
  return (
    <Card style={{ gap: space[1] }}>
      <Eyebrow>{label}</Eyebrow>
      <Text role="display" tone="brand">
        {value ?? "—"}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  hwRow: { flexDirection: "row", gap: space[3], alignItems: "flex-start", paddingVertical: space[2] },
  checkbox: {
    width: space[6],
    height: space[6],
    borderRadius: radius.xs,
    // No "thick" borderWidth token exists (only hairline/thin=1) — this
    // checkbox wants a heavier 2px ring than `thin` gives it. Using `thin`
    // here rather than a raw value; flagged as a wanted-but-missing token.
    borderWidth: borderWidth.thin,
    borderColor: color.border.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { backgroundColor: color.bg.brand },
  strike: { textDecorationLine: "line-through" },
  pastWeekHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: space[1] },
});
