import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./AuthProvider";
import { Announcement, ClubEvent, DevelopmentPlan, Player } from "@/types/db";

export function useNextEvent() {
  const { profile } = useAuth();
  const [event, setEvent] = useState<ClubEvent | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.club_id) {
      setEvent(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("club_id", profile.club_id)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) console.error("Failed to load next event:", error.message);
      setEvent((data as ClubEvent | null) ?? null);
    } finally {
      setLoading(false);
    }
  }, [profile?.club_id]);

  useEffect(() => { load(); }, [load]);
  return { event, loading, refresh: load };
}

export function useWeekCounts() {
  const { profile } = useAuth();
  const [counts, setCounts] = useState({ games: 0, practices: 0, tournaments: 0, clubEvents: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.club_id) {
      setCounts({ games: 0, practices: 0, tournaments: 0, clubEvents: 0 });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from("events")
        .select("type")
        .eq("club_id", profile.club_id)
        .gte("starts_at", now.toISOString())
        .lte("starts_at", weekFromNow.toISOString());

      if (error) console.error("Failed to load weekly event counts:", error.message);
      const tally = { games: 0, practices: 0, tournaments: 0, clubEvents: 0 };
      (data ?? []).forEach((e: { type: string }) => {
        if (e.type === "game") tally.games++;
        else if (e.type === "practice") tally.practices++;
        else if (e.type === "tournament") tally.tournaments++;
        else tally.clubEvents++;
      });
      setCounts(tally);
    } finally {
      setLoading(false);
    }
  }, [profile?.club_id]);

  useEffect(() => { load(); }, [load]);
  return { counts, loading, refresh: load };
}

// Defined in ./feed so the pure feed-building module stays free of React
// and Supabase imports; re-exported here for existing call sites.
export type { AnnouncementWithRead } from "./feed";
import type { AnnouncementWithRead } from "./feed";

export function useRecentAnnouncements(limit = 5) {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementWithRead[]>([]);
  const [loading, setLoading] = useState(true);
  // Dashboard and the Announcements section both use this hook and can be
  // mounted at the same time (tabs stay mounted in the background), so the
  // realtime channel name needs a per-instance suffix — otherwise two
  // instances race to subscribe under the identical channel name and
  // Supabase throws "cannot add postgres_changes callbacks after subscribe()".
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  const load = useCallback(async () => {
    if (!profile?.club_id) {
      setAnnouncements([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("club_id", profile.club_id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) console.error("Failed to load announcements:", error.message);
      const rows = (data as Announcement[]) ?? [];

      let readIds = new Set<string>();
      if (rows.length && profile?.id) {
        const { data: reads } = await supabase
          .from("announcement_reads")
          .select("announcement_id")
          .eq("user_id", profile.id)
          .in("announcement_id", rows.map((r) => r.id));
        readIds = new Set((reads ?? []).map((r) => r.announcement_id));
      }

      setAnnouncements(rows.map((r) => ({ ...r, isRead: readIds.has(r.id) })));
    } finally {
      setLoading(false);
    }
  }, [profile?.club_id, profile?.id, limit]);

  useEffect(() => { load(); }, [load]);

  // Realtime: a newly posted announcement shows up (as unread) without a
  // manual pull-to-refresh, same as a new message landing in GroupMe/TeamSnap.
  useEffect(() => {
    if (!profile?.club_id) return;
    const channel = supabase
      .channel(`announcements-${profile.club_id}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements", filter: `club_id=eq.${profile.club_id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.club_id, load, instanceId]);

  const markAsRead = useCallback(async (announcementId: string) => {
    if (!profile?.id) return;
    setAnnouncements((prev) => prev.map((a) => (a.id === announcementId ? { ...a, isRead: true } : a)));
    await supabase
      .from("announcement_reads")
      .upsert({ announcement_id: announcementId, user_id: profile.id }, { onConflict: "announcement_id,user_id" });
  }, [profile?.id]);

  const markAllAsRead = useCallback(async () => {
    if (!profile?.id) return;
    const unreadIds = announcements.filter((a) => !a.isRead).map((a) => a.id);
    if (!unreadIds.length) return;
    setAnnouncements((prev) => prev.map((a) => ({ ...a, isRead: true })));
    await supabase
      .from("announcement_reads")
      .upsert(
        unreadIds.map((id) => ({ announcement_id: id, user_id: profile.id })),
        { onConflict: "announcement_id,user_id" }
      );
  }, [profile?.id, announcements]);

  return { announcements, loading, refresh: load, markAsRead, markAllAsRead };
}

// Lightweight unread count for the tab bar badge — fetches just ids, not full
// announcement rows, and stays live via the same realtime pattern.
export function useUnreadAnnouncementsCount() {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  const load = useCallback(async () => {
    if (!profile?.club_id || !profile?.id) {
      setCount(0);
      return;
    }
    const [{ data: all }, { data: reads }] = await Promise.all([
      supabase.from("announcements").select("id").eq("club_id", profile.club_id),
      supabase.from("announcement_reads").select("announcement_id").eq("user_id", profile.id),
    ]);
    const readIds = new Set((reads ?? []).map((r) => r.announcement_id));
    setCount((all ?? []).filter((a) => !readIds.has(a.id)).length);
  }, [profile?.club_id, profile?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile?.club_id) return;
    const channel = supabase
      .channel(`announcements-badge-${profile.club_id}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements", filter: `club_id=eq.${profile.club_id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcement_reads", filter: `user_id=eq.${profile.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.club_id, profile?.id, load, instanceId]);

  return count;
}

export function useMyPlayers() {
  const { profile } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) {
      setPlayers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.from("players").select("*").eq("parent_id", profile.id).is("archived_at", null);
      if (error) console.error("Failed to load players:", error.message);
      setPlayers((data as Player[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);
  return { players, loading, refresh: load };
}

export function useLatestDevelopmentPlan(playerId?: string) {
  const [plan, setPlan] = useState<DevelopmentPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerId) {
      setPlan(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("development_plans")
        .select("*")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) console.error("Failed to load development plan:", error.message);
      setPlan((data as DevelopmentPlan | null) ?? null);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => { load(); }, [load]);
  return { plan, loading, refresh: load };
}
