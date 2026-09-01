import React, { useCallback, useMemo, useState } from "react";
import { View, FlatList, StyleSheet, Pressable, TextInput } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { format, isToday } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { useRecentAnnouncements } from "@/lib/hooks";
import { ANNOUNCEMENT_CATEGORIES, FILTER_BUCKETS, FilterBucket } from "@/lib/announcementCategories";
import SwipeableRow from "@/components/SwipeableRow";
import { confirmAsync, notify } from "@/lib/alertCompat";
import { Text, Eyebrow, FilterChipRow, EmptyState } from "@/components/ui";
import { color, space, radius, elevation, borderWidth, type as typeTokens } from "@/theme";
import ListState from "@/components/ListState";

function formatPostedAt(iso: string) {
  const date = new Date(iso);
  return isToday(date) ? `Today at ${format(date, "h:mm a")}` : format(date, "MMM d, h:mm a");
}

// FilterChipRow trades in plain label strings, but the buckets it renders
// also carry a distinct filter key — this maps the label back to the key
// `onChange` needs, without changing FilterChipRow's generic string API.
const FILTER_LABEL_TO_KEY = new Map(FILTER_BUCKETS.map((b) => [b.label, b.key]));

export default function AnnouncementsList() {
  const { profile } = useAuth();
  const { announcements, loading, error, refresh, markAllAsRead } = useRecentAnnouncements(50);
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
    }, [markAllAsRead]),
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

  const activeLabel = FILTER_BUCKETS.find((b) => b.key === filter)?.label ?? "All";

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={color.icon.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search announcements…"
          placeholderTextColor={color.text.tertiary}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <View style={styles.filterRow}>
        <FilterChipRow
          options={FILTER_BUCKETS.map((b) => b.label)}
          value={activeLabel}
          onChange={(label) => setFilter((FILTER_LABEL_TO_KEY.get(label) ?? "all") as FilterBucket | "all")}
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
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <ListState loading={loading} error={error} isEmpty={false} onRetry={refresh} emptyTitle="">
            <EmptyState icon="megaphone-outline" title="No announcements yet" />
          </ListState>
        }
        renderItem={({ item }) => {
          const meta = ANNOUNCEMENT_CATEGORIES[item.category];
          const cardContent = (
            <View style={styles.cardOuter}>
              <View style={styles.cardClip}>
                <View style={[styles.accentBar, { backgroundColor: meta.color }]} />
                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    <View style={styles.categoryRow}>
                      <Ionicons name={meta.icon} size={15} color={meta.color} />
                      <Eyebrow style={{ color: meta.color }}>{meta.label}</Eyebrow>
                    </View>
                    <View style={styles.headerRightRow}>
                      {canDelete(item.author_id) && (
                        <Pressable
                          onPress={() => router.push(`/modals/create-announcement?announcementId=${item.id}`)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Edit announcement"
                        >
                          <Ionicons name="pencil" size={15} color={color.icon.muted} />
                        </Pressable>
                      )}
                      {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: meta.color }]} />}
                    </View>
                  </View>
                  <Text role="h3" style={!item.isRead && styles.titleUnread}>
                    {item.pinned ? "📌 " : ""}
                    {item.title}
                  </Text>
                  <Text role="body" tone="secondary" style={styles.body}>
                    {item.body}
                  </Text>
                  <View style={styles.footerRow}>
                    <Text role="caption" tone="tertiary">
                      {formatPostedAt(item.created_at)}
                    </Text>
                    {meta.actionLabel && (
                      <Pressable
                        onPress={() => router.push("/(tabs)/schedule?section=events")}
                        accessibilityRole="button"
                        accessibilityLabel={meta.actionLabel}
                      >
                        <Text role="label" style={{ color: meta.color }}>
                          {meta.actionLabel} →
                        </Text>
                      </Pressable>
                    )}
                  </View>
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
        <Pressable
          style={styles.fab}
          onPress={() => router.push("/modals/create-announcement")}
          accessibilityRole="button"
          accessibilityLabel="New announcement"
        >
          <Ionicons name="add" size={20} color={color.icon.inverse} />
          <Text role="h3" tone="inverse">
            New Announcement
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: color.bg.surface,
    borderRadius: radius.input,
    borderWidth: borderWidth.thin,
    borderColor: color.border.subtle,
    marginHorizontal: space[4],
    marginTop: space[3],
    paddingHorizontal: space[3],
  },
  searchInput: { flex: 1, color: color.text.primary, fontSize: typeTokens.body.fontSize, paddingVertical: space[3] },
  filterRow: { paddingVertical: space[3], borderBottomWidth: borderWidth.thin, borderBottomColor: color.border.subtle },

  listContent: { padding: space[4], paddingTop: space[1], gap: space[3] },

  cardOuter: { borderRadius: radius.card, backgroundColor: color.bg.surface, ...elevation.card },
  cardClip: { flexDirection: "row", borderRadius: radius.card, overflow: "hidden" },
  accentBar: { width: space[1] },
  cardBody: { flex: 1, padding: space[4], gap: space[1] },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: space[1] },
  headerRightRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  unreadDot: { width: space[2], height: space[2], borderRadius: radius.full },

  titleUnread: { fontWeight: "800" },
  body: { marginTop: space[1] },

  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space[2] },

  fab: {
    position: "absolute",
    right: space[4],
    bottom: space[5],
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.full,
    backgroundColor: color.bg.brand,
    ...elevation.raised,
  },
});
