import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { format, isToday } from "date-fns";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/announcementCategories";
import { AnnouncementWithRead } from "@/lib/feed";

function formatPostedAt(iso: string) {
  const date = new Date(iso);
  return isToday(date) ? `Today at ${format(date, "h:mm a")}` : format(date, "MMM d, h:mm a");
}

interface Props {
  announcement: AnnouncementWithRead;
  canEdit: boolean;
}

export default function AnnouncementCard({ announcement, canEdit }: Props) {
  const meta = ANNOUNCEMENT_CATEGORIES[announcement.category];
  const isAuto = !!announcement.auto_generated;
  // A generated notice describes an edit the app witnessed. Letting someone
  // retype it would let the record drift from the event it reports on, so
  // it's delete-only (via swipe) rather than editable.
  const showEditPencil = canEdit && !isAuto;

  return (
    <View style={styles.card}>
      <View style={[styles.accentBar, { backgroundColor: meta.color }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={styles.categoryRow}>
            <Ionicons name={meta.icon} size={15} color={meta.color} />
            <Text style={[styles.categoryLabel, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <View style={styles.headerRightRow}>
            {isAuto && (
              <View style={styles.autoChip}>
                <Ionicons name="flash" size={10} color="#9A9DA3" />
                <Text style={styles.autoChipText}>Automatic</Text>
              </View>
            )}
            {showEditPencil && (
              <Pressable
                onPress={() => router.push(`/modals/create-announcement?announcementId=${announcement.id}`)}
                hitSlop={8}
              >
                <Ionicons name="pencil" size={15} color="#6B6F76" />
              </Pressable>
            )}
            {!announcement.isRead && <View style={[styles.unreadDot, { backgroundColor: meta.color }]} />}
          </View>
        </View>

        <Text style={[styles.title, !announcement.isRead && styles.titleUnread]}>
          {announcement.pinned ? "📌 " : ""}
          {announcement.title}
        </Text>
        {/* Generated diffs are two short "Was → Now" lines; monospacing the
            arrow rows keeps them scannable next to prose announcements. */}
        <Text style={[styles.body, isAuto && styles.bodyAuto]}>{announcement.body}</Text>

        {/* No "View Schedule →" action link any more: the sessions this would
            have jumped to are in the same list, a few rows down. */}
        <Text style={styles.meta}>{formatPostedAt(announcement.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", backgroundColor: "#141416", borderRadius: 14, marginBottom: 10, overflow: "hidden" },
  accentBar: { width: 4, backgroundColor: "#0A6CFF" },
  cardBody: { flex: 1, padding: 14 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerRightRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  categoryLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 16, fontWeight: "700", color: "#F2F2F3" },
  titleUnread: { fontWeight: "800" },
  body: { fontSize: 14, color: "#B5B8BE", marginTop: 6, lineHeight: 20 },
  bodyAuto: { fontVariant: ["tabular-nums"], lineHeight: 22 },
  autoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#1C1D20",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  autoChipText: { fontSize: 10, fontWeight: "700", color: "#9A9DA3", letterSpacing: 0.3 },
  meta: { fontSize: 12, color: "#6B6F76", marginTop: 10 },
});
