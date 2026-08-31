import React from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { format } from "date-fns";
import { router } from "expo-router";
import { useAuth } from "@/lib/AuthProvider";
import { useNextEvent, useWeekCounts, useActivityStats, useRecentAnnouncements, useMyPlayers, useLatestDevelopmentPlan } from "@/lib/hooks";
import ClubBioSection from "@/components/ClubBioSection";
import CoachesSection from "@/components/CoachesSection";
function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function PlayerDevelopmentCard() {
  const { players, loading } = useMyPlayers();
  const [selectedId, setSelectedId] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!selectedId && players.length) setSelectedId(players[0].id);
    if (selectedId && players.length && !players.some((p) => p.id === selectedId)) setSelectedId(players[0].id);
  }, [players, selectedId]);

  const player = players.find((p) => p.id === selectedId) ?? players[0];
  const { plan } = useLatestDevelopmentPlan(player?.id);

  if (!player) {
    // Joining a club doesn't automatically connect a parent to their
    // child's record — without this, a parent's dashboard just silently
    // has no player card at all, with no clue why or what to do about it.
    if (loading) return null;
    return (
      <Card>
        <Text style={styles.cardLabel}>MY PLAYERS</Text>
        <Text style={styles.muted}>No child linked to your account yet. Your director can give you a one-time player code.</Text>
        <Pressable style={styles.linkButton} onPress={() => router.push("/claim-player")}>
          <Text style={styles.linkButtonText}>Link a Player →</Text>
        </Pressable>
      </Card>
    );
  }

  const before = plan?.overall_score_before ?? 0;
  const after = plan?.overall_score_after ?? before;
  const delta = after - before;

  return (
    <Card>
      <Text style={styles.cardLabel}>MY PLAYERS</Text>
      {players.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerPicker} contentContainerStyle={styles.playerPickerRow}>
          {players.map((p) => (
            <Pressable key={p.id} onPress={() => setSelectedId(p.id)} style={[styles.playerChip, p.id === player.id && styles.playerChipActive]}>
              <Text style={[styles.playerChipText, p.id === player.id && styles.playerChipTextActive]}>{p.full_name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <Text style={styles.playerName}>{player.full_name}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={styles.bigScore}>{after || "—"}</Text>
        {delta !== 0 && (
          <Text style={[styles.delta, { color: delta > 0 ? "#30D158" : "#FF6B6B" }]}>
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}
          </Text>
        )}
      </View>
      {plan?.summary ? <Text style={styles.muted}>{plan.summary}</Text> : <Text style={styles.muted}>No published development plan yet.</Text>}
      <Pressable style={styles.linkButton} onPress={() => router.push(`/player/${player.id}`)}>
        <Text style={styles.linkButtonText}>View development profile →</Text>
      </Pressable>
    </Card>
  );
}

export default function Dashboard() {
  const { profile, orgConfig } = useAuth();
  const { event, loading: eventLoading, refresh: refreshEvent } = useNextEvent();
  const { counts, loading: countsLoading, refresh: refreshCounts } = useWeekCounts();
  const { stats, loading: statsLoading, refresh: refreshStats } = useActivityStats();
  const { announcements, loading: annLoading, refresh: refreshAnn } = useRecentAnnouncements(3);

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshEvent(), refreshCounts(), refreshStats(), refreshAnn()]);
    setRefreshing(false);
  };

  return (
  <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
    <ClubBioSection />
    <CoachesSection />

    <Card>
      <Text style={styles.cardLabel}>NEXT EVENT</Text>
      {eventLoading ? (
        <Text style={styles.muted}>Loading...</Text>
      ) : event ? (
          <Pressable onPress={() => router.push(`/event/${event.id}`)}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.muted}>
              {format(new Date(event.starts_at), "EEE, MMM d — h:mm a")}
              {event.location ? ` · ${event.location}` : ""}
            </Text>
            <Text style={styles.linkButtonText}>RSVP / attendance →</Text>
          </Pressable>
        ) : (
          <Text style={styles.muted}>Nothing scheduled yet.</Text>
        )}
      </Card>

      {orgConfig.features.games ? (
        <Card>
          <Text style={styles.cardLabel}>CLUB THIS WEEK</Text>
          {countsLoading ? (
            <Text style={styles.muted}>Loading…</Text>
          ) : (
            <View style={styles.statsRow}>
              <Stat n={counts.games} label="Games" />
              <Stat n={counts.practices} label="Practices" />
              <Stat n={counts.tournaments} label="Tournaments" />
              <Stat n={counts.clubEvents} label="Club Events" />
            </View>
          )}
        </Card>
      ) : (
        <Card>
          <Text style={styles.cardLabel}>THIS WEEK</Text>
          {statsLoading ? (
            <Text style={styles.muted}>Loading…</Text>
          ) : (
            <View style={styles.statsRow}>
              <Stat n={stats.sessionsDelivered} label="Sessions" />
              <Stat n={stats.playersEvaluated} label="Players Evaluated" />
              <Stat n={stats.homeworkCompletionPct ?? 0} label="Homework Done" suffix="%" />
            </View>
          )}
        </Card>
      )}

      {profile?.role === "parent" && <PlayerDevelopmentCard />}

      <Card>
        <Text style={styles.cardLabel}>ANNOUNCEMENTS</Text>
        {annLoading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : announcements.length === 0 ? (
          <Text style={styles.muted}>No announcements yet.</Text>
        ) : (
          announcements.map((a) => (
            <View key={a.id} style={styles.annRow}>
              <Text style={styles.annTitle}>{a.pinned ? "📌 " : ""}{a.title}</Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function Stat({ n, label, suffix }: { n: number; label: string; suffix?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNum}>{n}{suffix ?? ""}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0D", padding: 16 },
  card: { backgroundColor: "#141416", borderRadius: 14, padding: 16, marginBottom: 14 },
  cardLabel: { fontSize: 12, fontWeight: "700", color: "#9A9DA3", letterSpacing: 0.5, marginBottom: 8 },
  eventTitle: { fontSize: 18, fontWeight: "700", color: "#0A6CFF" },
  muted: { color: "#9A9DA3", marginTop: 4 },
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  stat: { alignItems: "center" },
  statNum: { fontSize: 22, fontWeight: "800", color: "#0A6CFF" },
  statLabel: { fontSize: 12, color: "#9A9DA3", marginTop: 2 },
  bigScore: { fontSize: 36, fontWeight: "800", color: "#0A6CFF" },
  delta: { fontSize: 16, fontWeight: "700" },
  annRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#242424" },
  annTitle: { fontSize: 15, fontWeight: "600", color: "#F2F2F3" },
  playerPicker: { marginBottom: 10 },
  playerPickerRow: { flexDirection: "row", alignItems: "flex-start" },
  playerChip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 18, backgroundColor: "#17181B", marginRight: 8 },
  playerChipActive: { backgroundColor: "#0A6CFF" },
  playerChipText: { color: "#9A9DA3", fontWeight: "600", fontSize: 12 },
  playerChipTextActive: { color: "#fff" },
  playerName: { fontSize: 16, fontWeight: "700", color: "#F2F2F3" },
  linkButton: { marginTop: 12 },
  linkButtonText: { color: "#0A6CFF", fontWeight: "700", marginTop: 7 },
});
