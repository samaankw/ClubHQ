import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, TextInput } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { useRecentAnnouncements } from "@/lib/hooks";
import { useAsyncData } from "@/lib/asyncData";
import { ClubEvent } from "@/types/db";
import { buildFeed, filterFromSectionParam, FEED_FILTERS, FeedFilter, FeedItem } from "@/lib/feed";
import AnnouncementCard from "@/components/AnnouncementCard";
import EventCard from "@/components/EventCard";
import SwipeableRow from "@/components/SwipeableRow";
import ListState from "@/components/ListState";
import { chooseAsync, confirmAsync, notify } from "@/lib/alertCompat";

/**
 * One chronological feed instead of an Events / Announcements toggle.
 *
 * The old split was a database split, not a user split — four of the eleven
 * announcement categories (schedule, location, holiday, weather) are *about*
 * events, and three of them rendered a "View Schedule →" button whose only
 * job was to jump across the toggle the user had just used. Merging also
 * fixes the unread badge, which sat on this tab but counted announcements
 * while the tab opened on Events by default.
 */
export default function Schedule() {
  const { profile } = useAuth();
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();

  const [filter, setFilter] = useState<FeedFilter>(() => filterFromSectionParam(sectionParam));
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  // Recomputed per render so "Today" stays correct across a midnight rollover
  // while the app sits backgrounded on someone's phone.
  const [now, setNow] = useState(() => new Date());

  const { announcements, loading: annLoading, error: annError, refresh: refreshAnnouncements, markAllAsRead } = useRecentAnnouncements(50);

  const isStaff = profile?.role === "coach" || profile?.role === "director";

  // Deep links from push notifications and both create modals still arrive as
  // ?section=events / ?section=announcements — they select a filter now.
  useEffect(() => {
    if (sectionParam) setFilter(filterFromSectionParam(sectionParam));
  }, [sectionParam]);

  const clubId = profile?.club_id;
  const {
    data: events,
    loading: eventsLoading,
    error: eventsError,
    retry: loadEvents,
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

  // Opening the tab clears the unread badge. This is now correct by
  // construction: everything the badge counts is visible on this screen.
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      markAllAsRead();
    }, [markAllAsRead]),
  );

  const refreshAll = useCallback(() => {
    loadEvents();
    refreshAnnouncements();
  }, [loadEvents, refreshAnnouncements]);

  const feed = useMemo(() => buildFeed({ events, announcements, filter, query, now }), [events, announcements, filter, query, now]);

  const canDeleteEvent = (createdBy: string) => profile?.role === "director" || profile?.id === createdBy;
  const canDeleteAnnouncement = (authorId: string) => profile?.role === "director" || profile?.id === authorId;

  // Swipe-to-delete goes through the same RPC as the detail screen so a
  // session cancelled from the feed announces itself identically. Deleting
  // here used to be the one path that could silently drop an upcoming session.
  const deleteEvent = async (event: ClubEvent) => {
    const detail = `"${event.title}" will be removed for everyone, including any RSVPs. This can't be undone.`;
    const isUpcoming = new Date(event.starts_at).getTime() > Date.now();

    let notifyFamilies = false;
    if (isUpcoming) {
      const choice = await chooseAsync("Delete session?", detail, [
        { key: "notify", label: "Delete and notify families", destructive: true },
        { key: "quiet", label: "Delete without notifying", destructive: true },
      ]);
      if (!choice) return;
      notifyFamilies = choice === "notify";
    } else if (!(await confirmAsync("Delete session?", detail))) {
      return;
    }

    const { data, error } = await supabase.rpc("delete_event", {
      p_event_id: event.id,
      p_notify: notifyFamilies,
    });
    if (error) return notify("Couldn't delete", error.message);
    for (const announcementId of (data as string[] | null) ?? []) {
      supabase.functions.invoke("send-announcement-push", { body: { announcementId } }).catch((err) => {
        console.warn("cancellation push failed", err);
      });
    }
    loadEvents();
    refreshAnnouncements();
  };

  const deleteAnnouncement = async (id: string, title: string) => {
    const ok = await confirmAsync("Delete announcement?", `"${title}" will be removed for everyone. This can't be undone.`);
    if (!ok) return;
    const { data, error } = await supabase.from("announcements").delete().eq("id", id).select();
    if (error) return notify("Couldn't delete", error.message);
    if (!data?.length) return notify("Couldn't delete", "You don't have permission to delete this announcement.");
    refreshAnnouncements();
  };

  const renderItem = ({ item }: { item: FeedItem }) => {
    if (item.kind === "header") {
      return (
        <View style={styles.headerRow}>
          <Text style={[styles.headerText, item.isNow && styles.headerTextNow]}>{item.label}</Text>
          {item.isNow && <View style={styles.headerRule} />}
        </View>
      );
    }

    if (item.kind === "event") {
      const card = <EventCard event={item.event} />;
      return canDeleteEvent(item.event.created_by) ? <SwipeableRow onDelete={() => deleteEvent(item.event)}>{card}</SwipeableRow> : card;
    }

    const editable = canDeleteAnnouncement(item.announcement.author_id);
    const card = <AnnouncementCard announcement={item.announcement} canEdit={editable} />;
    return editable ? (
      <SwipeableRow onDelete={() => deleteAnnouncement(item.announcement.id, item.announcement.title)}>{card}</SwipeableRow>
    ) : (
      card
    );
  };

  const emptyMessage = query.trim() || filter !== "all" ? "Nothing matches that." : "Nothing scheduled or posted yet.";

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#6B6F76" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search sessions and updates…"
          placeholderTextColor="#6B6F76"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#6B6F76" />
          </Pressable>
        )}
      </View>

      <View style={styles.filterRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FEED_FILTERS}
          keyExtractor={(f) => f.key}
          contentContainerStyle={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, gap: 8 }}
          renderItem={({ item }) => (
            <Pressable style={[styles.filterChip, filter === item.key && styles.filterChipActive]} onPress={() => setFilter(item.key)}>
              <Text style={[styles.filterChipText, filter === item.key && styles.filterChipTextActive]}>{item.label}</Text>
            </Pressable>
          )}
        />
      </View>

      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onRefresh={refreshAll}
        refreshing={eventsLoading || annLoading}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 120 }}
        ListEmptyComponent={
          <ListState
            loading={eventsLoading || annLoading}
            error={eventsError || annError}
            isEmpty={false}
            onRetry={refreshAll}
            emptyTitle=""
          >
            <Text style={styles.muted}>{emptyMessage}</Text>
          </ListState>
        }
      />

      {isStaff && (
        <View style={styles.fabStack} pointerEvents="box-none">
          {composerOpen && (
            <>
              <Pressable
                style={styles.fabAction}
                onPress={() => {
                  setComposerOpen(false);
                  router.push("/modals/create-event");
                }}
              >
                <Ionicons name="calendar-outline" size={17} color="#fff" />
                <Text style={styles.fabActionText}>New Session</Text>
              </Pressable>
              <Pressable
                style={styles.fabAction}
                onPress={() => {
                  setComposerOpen(false);
                  router.push("/modals/create-announcement");
                }}
              >
                <Ionicons name="megaphone-outline" size={17} color="#fff" />
                <Text style={styles.fabActionText}>New Announcement</Text>
              </Pressable>
            </>
          )}
          <Pressable
            style={styles.fab}
            onPress={() => setComposerOpen((open) => !open)}
            accessibilityLabel={composerOpen ? "Close create menu" : "Create session or announcement"}
          >
            <Ionicons name={composerOpen ? "close" : "add"} size={26} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0D" },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#141416",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#242424",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: "#F2F2F3", fontSize: 14, paddingVertical: 11 },

  filterRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1C1D20" },
  filterChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, backgroundColor: "#17181B" },
  filterChipActive: { backgroundColor: "#0A6CFF" },
  filterChipText: { color: "#9A9DA3", fontWeight: "700", fontSize: 13 },
  filterChipTextActive: { color: "#fff" },

  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 8 },
  headerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9A9DA3",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  headerTextNow: { color: "#0A6CFF" },
  headerRule: { flex: 1, height: 1, backgroundColor: "#1F2A38" },

  muted: { color: "#6B6F76", textAlign: "center", marginTop: 48 },

  fabStack: { position: "absolute", right: 16, bottom: 24, alignItems: "flex-end", gap: 10 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0A6CFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fabAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: "#1C1D20",
    borderWidth: 1,
    borderColor: "#2A2B2F",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fabActionText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
