import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { format } from "date-fns";
import { ClubEvent } from "@/types/db";
import { teamLabel } from "@/lib/teamLabel";

const TYPE_EMOJI: Record<string, string> = {
  practice: "🏃",
  game: "⚽",
  tournament: "🏆",
  club_event: "🎉",
};

export function audienceLabel(event: ClubEvent): string {
  const targets = event.event_players ?? [];
  const names = targets.map((t) => t.players.full_name).join(", ");
  // A team event with specific players attached means "not everyone in the
  // group showed up" — still worth labeling by group, just with who's in.
  if (targets.length && event.team_id) return `${event.teams ? teamLabel(event.teams) : "Team"} · ${names}`;
  if (targets.length) return names;
  if (event.team_id) return event.teams ? teamLabel(event.teams) : "Team";
  return "Club-wide";
}

export default function EventCard({ event }: { event: ClubEvent }) {
  const isPrivate = !!event.event_players?.length;

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/event/${event.id}`)}>
      <Text style={styles.emoji}>{TYPE_EMOJI[event.type] ?? "📅"}</Text>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{event.title}</Text>
          <View style={[styles.audienceTag, isPrivate && styles.audienceTagPrivate]}>
            <Text style={[styles.audienceTagText, isPrivate && styles.audienceTagTextPrivate]}>
              {audienceLabel(event)}
            </Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {format(new Date(event.starts_at), "h:mm a")}
          {event.location ? ` · ${event.location}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#141416",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emoji: { fontSize: 22 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 15, fontWeight: "700", color: "#F2F2F3" },
  audienceTag: { backgroundColor: "#1C2733", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  audienceTagPrivate: { backgroundColor: "#1F2A1C" },
  audienceTagText: { fontSize: 11, fontWeight: "700", color: "#7FB3E8" },
  audienceTagTextPrivate: { color: "#8FD19E" },
  meta: { fontSize: 13, color: "#9A9DA3", marginTop: 2 },
});
