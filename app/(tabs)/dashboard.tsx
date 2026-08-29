import React from "react";
import { View, ScrollView, RefreshControl } from "react-native";
import { format } from "date-fns";
import { router } from "expo-router";
import { useAuth } from "@/lib/AuthProvider";
import { useNextEvent, useWeekCounts, useRecentAnnouncements, useMyPlayers, useLatestDevelopmentPlan } from "@/lib/hooks";
import ClubBioSection from "@/components/ClubBioSection";
import CoachesSection from "@/components/CoachesSection";
import {
  Screen,
  Card,
  Eyebrow,
  Text,
  Button,
  Badge,
  Avatar,
  Chip,
  IconChip,
  StatTile,
  ListRow,
  ProgressBar,
  Divider,
} from "@/components/ui";
import { space } from "@/theme";

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
      <Card style={{ gap: space[3] }}>
        <Eyebrow>My Players</Eyebrow>
        <Text tone="secondary">
          No child linked to your account yet. Your director can give you a one-time player code.
        </Text>
        <Button label="Link a Player" variant="secondary" size="sm" onPress={() => router.push("/claim-player")} />
      </Card>
    );
  }

  const before = plan?.overall_score_before ?? 0;
  const after = plan?.overall_score_after ?? before;
  const delta = after - before;

  return (
    <Card style={{ gap: space[3] }}>
      <Eyebrow>My Players</Eyebrow>

      {players.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            {players.map((p) => (
              <Chip key={p.id} label={p.full_name} selected={p.id === player.id} onPress={() => setSelectedId(p.id)} />
            ))}
          </View>
        </ScrollView>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <Avatar uri={player.photo_url} name={player.full_name} />
        <Text role="h2">{player.full_name}</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <Text role="display" tone="brand">
          {after || "—"}
        </Text>
        {delta !== 0 && (
          <Badge label={`${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)}`} tone={delta > 0 ? "success" : "danger"} />
        )}
      </View>
      <ProgressBar value={after / 100} />

      <Text tone="secondary">{plan?.summary ? plan.summary : "No published development plan yet."}</Text>

      <Button
        label="View development profile"
        variant="ghost"
        size="sm"
        onPress={() => router.push(`/player/${player.id}`)}
      />
    </Card>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { event, loading: eventLoading, refresh: refreshEvent } = useNextEvent();
  const { counts, loading: countsLoading, refresh: refreshCounts } = useWeekCounts();
  const { announcements, loading: annLoading, refresh: refreshAnn } = useRecentAnnouncements(3);

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshEvent(), refreshCounts(), refreshAnn()]);
    setRefreshing(false);
  };

  return (
    <Screen scroll={false}>
      <ScrollView
        contentContainerStyle={{ padding: space[4], gap: space[4] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ClubBioSection />
        <CoachesSection />

        <Card padded={false} style={{ paddingVertical: space[2] }}>
          <View style={{ paddingHorizontal: space[4], paddingTop: space[2] }}>
            <Eyebrow>Next Event</Eyebrow>
          </View>
          {eventLoading ? (
            <Text tone="secondary" style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
              Loading...
            </Text>
          ) : event ? (
            <View style={{ paddingHorizontal: space[4] }}>
              <ListRow
                icon="calendar"
                title={event.title}
                subtitle={`${format(new Date(event.starts_at), "EEE, MMM d — h:mm a")}${event.location ? ` · ${event.location}` : ""}`}
                onPress={() => router.push(`/event/${event.id}`)}
              />
            </View>
          ) : (
            <Text tone="secondary" style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
              Nothing scheduled yet.
            </Text>
          )}
        </Card>

        <Card style={{ gap: space[3] }}>
          <Eyebrow>Club This Week</Eyebrow>
          {countsLoading ? (
            <Text tone="secondary">Loading…</Text>
          ) : (
            <View style={{ gap: space[3] }}>
              <View style={{ flexDirection: "row", gap: space[3] }}>
                <StatTile label="Games" value={String(counts.games)} icon="football" />
                <StatTile label="Practices" value={String(counts.practices)} icon="fitness" />
              </View>
              <View style={{ flexDirection: "row", gap: space[3] }}>
                <StatTile label="Tournaments" value={String(counts.tournaments)} icon="trophy" />
                <StatTile label="Club Events" value={String(counts.clubEvents)} icon="megaphone" />
              </View>
            </View>
          )}
        </Card>

        {profile?.role === "parent" && <PlayerDevelopmentCard />}

        <Card style={{ gap: space[2] }}>
          <Eyebrow>Announcements</Eyebrow>
          {annLoading ? (
            <Text tone="secondary">Loading…</Text>
          ) : announcements.length === 0 ? (
            <Text tone="secondary">No announcements yet.</Text>
          ) : (
            announcements.map((a, i) => (
              <React.Fragment key={a.id}>
                {i > 0 && <Divider />}
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: space[2] }}>
                  {a.pinned ? <IconChip name="pin" tone="brand" size={14} /> : null}
                  <Text role="h3" style={{ flex: 1 }}>
                    {a.title}
                  </Text>
                </View>
              </React.Fragment>
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
