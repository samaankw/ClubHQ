import React, { useEffect, useState } from "react";
import { View, SectionList, Pressable, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { ClubEvent } from "@/types/db";
import { useVocab } from "@/lib/vocab";
import type { VocabSet } from "@/lib/vocab";
import { useAsyncData } from "@/lib/asyncData";
import ListState from "@/components/ListState";
import AnnouncementsList from "@/components/AnnouncementsList";
import SwipeableRow from "@/components/SwipeableRow";
import { confirmAsync, notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { Screen, Text, Eyebrow, Card, Badge, IconChip, EmptyState, SegmentedControl } from "@/components/ui";
import type { IconName } from "@/components/ui";
import { color, space, radius, elevation } from "@/theme";

// Mirrors the icon choice dashboard.tsx already uses for these same four
// event types (StatTile's games/practices/tournaments/club-events), so an
// event card's icon matches what a user has already seen elsewhere.
const TYPE_ICON: Record<string, IconName> = {
  practice: "fitness",
  game: "football",
  tournament: "trophy",
  club_event: "megaphone",
};

function audienceLabel(event: ClubEvent, vocab: VocabSet): string {
  const targets = event.event_players ?? [];
  const names = targets.map((t) => t.players.full_name).join(", ");
  const groupWord = vocab.group?.singular ?? "Team";
  // A team event with specific players attached means "not everyone in the
  // group showed up" — still worth labeling by group, just with who's in.
  if (targets.length && event.team_id) return `${event.teams ? teamLabel(event.teams) : groupWord} · ${names}`;
  if (targets.length) return names;
  if (event.team_id) return event.teams ? teamLabel(event.teams) : groupWord;
  return `${vocab.organization.singular}-wide`;
}

type Section = "events" | "announcements";

function EventsSection() {
  const { profile } = useAuth();
  const vocab = useVocab();
  const clubId = profile?.club_id;
  const canCreate = profile?.role === "coach" || profile?.role === "director";

  const {
    data: events,
    loading,
    error,
    retry: load,
  } = useAsyncData<ClubEvent[]>(
    async () => {
      if (!clubId) return [];
      const { data, error } = await supabase
        .from("events")
        .select("*, teams(name, age_group), event_players(players(id, full_name))")
        .eq("club_id", clubId)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data as ClubEvent[]) ?? [];
    },
    [clubId],
    [],
  );

  const canDelete = (createdBy: string) => profile?.role === "director" || profile?.id === createdBy;

  const confirmDelete = async (id: string, title: string) => {
    const ok = await confirmAsync("Delete event?", `"${title}" will be removed for everyone, including any RSVPs. This can't be undone.`);
    if (!ok) return;
    const { data, error } = await supabase.from("events").delete().eq("id", id).select();
    if (error) return notify("Couldn't delete", error.message);
    if (!data || data.length === 0) return notify("Couldn't delete", "You don't have permission to delete this event.");
    load();
  };

  const sections = Object.values(
    events.reduce((acc: Record<string, { title: string; data: ClubEvent[] }>, ev) => {
      const day = format(new Date(ev.starts_at), "EEEE, MMMM d");
      if (!acc[day]) acc[day] = { title: day, data: [] };
      acc[day].data.push(ev);
      return acc;
    }, {}),
  );

  return (
    <View style={styles.eventsWrap}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        onRefresh={load}
        refreshing={loading}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section }) => <Eyebrow style={styles.sectionHeader}>{section.title}</Eyebrow>}
        ListEmptyComponent={
          <ListState loading={loading} error={error} isEmpty={false} onRetry={load} emptyTitle="">
            <EmptyState icon="calendar-outline" title="No upcoming events" />
          </ListState>
        }
        renderItem={({ item }) => {
          const isPrivate = !!item.event_players?.length;
          const row = (
            <Pressable onPress={() => router.push(`/event/${item.id}`)} accessibilityRole="button" accessibilityLabel={item.title}>
              <Card style={styles.card}>
                <IconChip name={TYPE_ICON[item.type] ?? "calendar"} />
                <View style={styles.cardBody}>
                  <View style={styles.titleRow}>
                    <Text role="h3" style={styles.titleText}>
                      {item.title}
                    </Text>
                    <Badge label={audienceLabel(item, vocab)} tone={isPrivate ? "success" : "brand"} />
                  </View>
                  <Text role="bodySm" tone="secondary">
                    {format(new Date(item.starts_at), "h:mm a")}
                    {item.location ? ` · ${item.location}` : ""}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
          return canDelete(item.created_by) ? <SwipeableRow onDelete={() => confirmDelete(item.id, item.title)}>{row}</SwipeableRow> : row;
        }}
      />
      {canCreate && (
        <Pressable
          style={styles.fab}
          onPress={() => router.push("/modals/create-event")}
          accessibilityRole="button"
          accessibilityLabel="Create event"
        >
          <Ionicons name="add" size={28} color={color.icon.inverse} />
        </Pressable>
      )}
    </View>
  );
}

export default function Schedule() {
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(sectionParam === "announcements" ? "announcements" : "events");

  // Lets a push notification tap (or a "View Schedule" link from an
  // announcement) land directly on the right section instead of always
  // defaulting to Events.
  useEffect(() => {
    if (sectionParam === "announcements" || sectionParam === "events") setSection(sectionParam);
  }, [sectionParam]);

  return (
    <Screen scroll={false}>
      <View style={styles.toggleRow}>
        <SegmentedControl
          options={["Events", "Announcements"]}
          value={section === "events" ? "Events" : "Announcements"}
          onChange={(v) => setSection(v === "Events" ? "events" : "announcements")}
        />
      </View>

      {section === "events" ? <EventsSection /> : <AnnouncementsList />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: { padding: space[3] },
  eventsWrap: { flex: 1 },
  listContent: { padding: space[4] },
  sectionHeader: { marginTop: space[4], marginBottom: space[2] },
  card: { flexDirection: "row", alignItems: "center", gap: space[3], marginBottom: space[2] },
  cardBody: { flex: 1, gap: space[1] },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" },
  titleText: { flexShrink: 1 },
  fab: {
    position: "absolute",
    right: space[5],
    bottom: space[6],
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: color.bg.brand,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.raised,
  },
});
