import React, { useCallback, useEffect, useState } from "react";
import { View, Text, SectionList, StyleSheet, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { ClubEvent } from "@/types/db";
import AnnouncementsList from "@/components/AnnouncementsList";
import SwipeableRow from "@/components/SwipeableRow";
import { confirmAsync, notify } from "@/lib/alertCompat";
import { groupLabel } from "@/lib/orgConfig";

const TYPE_EMOJI: Record<string, string> = {
  practice: "🏃",
  game: "⚽",
  tournament: "🏆",
  club_event: "🎉",
};

function audienceLabel(event: ClubEvent): string {
  const targets = event.event_players ?? [];
  const names = targets.map((t) => t.players.full_name).join(", ");
  // A team event with specific players attached means "not everyone in the
  // group showed up" — still worth labeling by group, just with who's in.
  if (targets.length && event.team_id) return `${event.teams ? groupLabel(event.teams) : "Team"} · ${names}`;
  if (targets.length) return names;
  if (event.team_id) return event.teams ? groupLabel(event.teams) : "Team";
  return "Club-wide";
}

type Section = "events" | "announcements";

function EventsSection() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const canCreate = profile?.role === "coach" || profile?.role === "director";

  const load = useCallback(async () => {
    if (!profile?.club_id) return;
    setLoading(true);
    const { data } = await supabase
      .from("events")
      .select("*, teams(name, age_group), event_players(players(id, full_name))")
      .eq("club_id", profile.club_id)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true });
    setEvents((data as ClubEvent[]) ?? []);
    setLoading(false);
  }, [profile?.club_id]);

  useEffect(() => {
    load();
  }, [load]);

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
    }, {})
  );

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        onRefresh={load}
        refreshing={loading}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        contentContainerStyle={{ padding: 16 }}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        ListEmptyComponent={<Text style={styles.muted}>No upcoming events.</Text>}
        renderItem={({ item }) => {
          const row = (
            <Pressable style={styles.card} onPress={() => router.push(`/event/${item.id}`)}>
              <Text style={styles.emoji}>{TYPE_EMOJI[item.type]}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{item.title}</Text>
                  <View style={[styles.audienceTag, !!item.event_players?.length && styles.audienceTagPrivate]}>
                    <Text style={[styles.audienceTagText, !!item.event_players?.length && styles.audienceTagTextPrivate]}>{audienceLabel(item)}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {format(new Date(item.starts_at), "h:mm a")}
                  {item.location ? ` · ${item.location}` : ""}
                </Text>
              </View>
            </Pressable>
          );
          return canDelete(item.created_by) ? (
            <SwipeableRow onDelete={() => confirmDelete(item.id, item.title)}>{row}</SwipeableRow>
          ) : (
            row
          );
        }}
      />
      {canCreate && (
        <Pressable style={styles.fab} onPress={() => router.push("/modals/create-event")}>
          <Text style={styles.fabText}>+</Text>
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
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <Pressable style={[styles.toggleButton, section === "events" && styles.toggleButtonActive]} onPress={() => setSection("events")}>
          <Text style={[styles.toggleText, section === "events" && styles.toggleTextActive]}>Events</Text>
        </Pressable>
        <Pressable style={[styles.toggleButton, section === "announcements" && styles.toggleButtonActive]} onPress={() => setSection("announcements")}>
          <Text style={[styles.toggleText, section === "announcements" && styles.toggleTextActive]}>Announcements</Text>
        </Pressable>
      </View>

      {section === "events" ? <EventsSection /> : <AnnouncementsList />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0D" },
  toggleRow: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    backgroundColor: "#0B0B0D",
    borderBottomWidth: 1,
    borderBottomColor: "#1C1D20",
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#17181B",
  },
  toggleButtonActive: { backgroundColor: "#0A6CFF" },
  toggleText: { fontWeight: "700", color: "#9A9DA3", fontSize: 14 },
  toggleTextActive: { color: "#fff" },
  sectionHeader: { fontSize: 13, fontWeight: "700", color: "#9A9DA3", marginTop: 16, marginBottom: 6, textTransform: "uppercase" },
  card: { backgroundColor: "#141416", borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12 },
  emoji: { fontSize: 22 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 15, fontWeight: "700", color: "#F2F2F3" },
  audienceTag: { backgroundColor: "#1C2733", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  audienceTagPrivate: { backgroundColor: "#1F2A1C" },
  audienceTagText: { fontSize: 11, fontWeight: "700", color: "#7FB3E8" },
  audienceTagTextPrivate: { color: "#8FD19E" },
  meta: { fontSize: 13, color: "#9A9DA3", marginTop: 2 },
  muted: { color: "#6B6F76", textAlign: "center", marginTop: 40 },
  fab: {
    position: "absolute", right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#0A6CFF", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  fabText: { color: "#fff", fontSize: 28, fontWeight: "700", marginTop: -2 },
});
