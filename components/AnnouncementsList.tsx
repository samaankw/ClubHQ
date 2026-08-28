import React, { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, TextInput } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { format, isToday } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { useRecentAnnouncements } from "@/lib/hooks";
import { ANNOUNCEMENT_CATEGORIES, FILTER_BUCKETS, FilterBucket } from "@/lib/announcementCategories";
import SwipeableRow from "@/components/SwipeableRow";
import { confirmAsync, notify } from "@/lib/alertCompat";

function formatPostedAt(iso: string) {
  const date = new Date(iso);
  return isToday(date) ? `Today at ${format(date, "h:mm a")}` : format(date, "MMM d, h:mm a");
}

export default function AnnouncementsList() {
  const { profile } = useAuth();
  const { announcements, loading, refresh, markAllAsRead } = useRecentAnnouncements(50);
  const [filter, setFilter] = useState<FilterBucket | "all">("all");
  const [query, setQuery] = useState("");
  const canPost = profile?.role === "coach" || profile?.role === "director";

  // Switching to this section clears the unread badge, same as opening the
  // feed in GroupMe/TeamSnap — there's no per-item detail screen to mark
  // read on tap. useFocusEffect fires on the host tab's focus regardless of
  // which section is showing, which is fine here — the host screen itself
  // remounts this component when the toggle switches to "Announcements".
  useFocusEffect(
    useCallback(() => {
      markAllAsRead();
    }, [markAllAsRead])
  );

  const filtered = useMemo(() => {
    let list = announcements;
    if (filter !== "all") list = list.filter((a) => ANNOUNCEMENT_CATEGORIES[a.category]?.bucket === filter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q));
    return list;
  }, [announcements, filter, query]);

  const canDelete = (authorId: string) => profile?.role === "director" || profile?.id === authorId;

  const confirmDelete = async (id: string, title: string) => {
    const ok = await confirmAsync("Delete announcement?", `"${title}" will be removed for everyone. This can't be undone.`);
    if (!ok) return;
    const { data, error } = await supabase.from("announcements").delete().eq("id", id).select();
    if (error) return notify("Couldn't delete", error.message);
    if (!data || data.length === 0) return notify("Couldn't delete", "You don't have permission to delete this announcement.");
    refresh();
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#6B6F76" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search announcements…"
          placeholderTextColor="#6B6F76"
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <View style={styles.filterRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTER_BUCKETS}
          keyExtractor={(f) => f.key}
          contentContainerStyle={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, gap: 8 }}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
              onPress={() => setFilter(item.key)}
            >
              <Text style={[styles.filterChipText, filter === item.key && styles.filterChipTextActive]}>{item.label}</Text>
            </Pressable>
          )}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(a) => a.id}
        onRefresh={refresh}
        refreshing={loading}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        ListEmptyComponent={<Text style={styles.muted}>No announcements yet.</Text>}
        renderItem={({ item }) => {
          const meta = ANNOUNCEMENT_CATEGORIES[item.category];
          const cardContent = (
            <View style={styles.card}>
              <View style={[styles.accentBar, { backgroundColor: meta.color }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <View style={styles.categoryRow}>
                    <Ionicons name={meta.icon} size={15} color={meta.color} />
                    <Text style={[styles.categoryLabel, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <View style={styles.headerRightRow}>
                    {canDelete(item.author_id) && (
                      <Pressable onPress={() => router.push(`/modals/create-announcement?announcementId=${item.id}`)} hitSlop={8}>
                        <Ionicons name="pencil" size={15} color="#6B6F76" />
                      </Pressable>
                    )}
                    {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: meta.color }]} />}
                  </View>
                </View>
                <Text style={[styles.title, !item.isRead && styles.titleUnread]}>
                  {item.pinned ? "📌 " : ""}{item.title}
                </Text>
                <Text style={styles.body}>{item.body}</Text>
                <View style={styles.footerRow}>
                  <Text style={styles.meta}>{formatPostedAt(item.created_at)}</Text>
                  {meta.actionLabel && (
                    <Pressable onPress={() => router.push("/(tabs)/schedule?section=events")}>
                      <Text style={[styles.actionLink, { color: meta.color }]}>{meta.actionLabel} →</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          );

          return canDelete(item.author_id) ? (
            <SwipeableRow onDelete={() => confirmDelete(item.id, item.title)}>{cardContent}</SwipeableRow>
          ) : (
            cardContent
          );
        }}
      />

      {canPost && (
        <Pressable style={styles.fab} onPress={() => router.push("/modals/create-announcement")}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.fabText}>New Announcement</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0D" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#141416", borderRadius: 10, borderWidth: 1, borderColor: "#242424", marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: "#F2F2F3", fontSize: 14, paddingVertical: 11 },
  filterRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1C1D20" },
  filterChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, backgroundColor: "#17181B" },
  filterChipActive: { backgroundColor: "#0A6CFF" },
  filterChipText: { color: "#9A9DA3", fontWeight: "700", fontSize: 13 },
  filterChipTextActive: { color: "#fff" },

  card: { flexDirection: "row", backgroundColor: "#141416", borderRadius: 14, marginBottom: 12, overflow: "hidden" },
  accentBar: { width: 4, backgroundColor: "#0A6CFF" },
  cardBody: { flex: 1, padding: 14 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerRightRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  categoryLabel: { fontSize: 11, fontWeight: "800", color: "#0A6CFF", letterSpacing: 0.4, textTransform: "uppercase" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#0A6CFF" },

  title: { fontSize: 16, fontWeight: "700", color: "#F2F2F3" },
  titleUnread: { fontWeight: "800" },
  body: { fontSize: 14, color: "#B5B8BE", marginTop: 6, lineHeight: 20 },

  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  meta: { fontSize: 12, color: "#6B6F76" },
  actionLink: { fontSize: 13, fontWeight: "700", color: "#0A6CFF" },

  muted: { color: "#6B6F76", textAlign: "center", marginTop: 40 },

  fab: {
    position: "absolute", right: 16, bottom: 20, flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: 28,
    backgroundColor: "#0A6CFF", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  fabText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
