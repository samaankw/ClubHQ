import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "./supabase";
import { useAuth } from "./AuthProvider";
import { dedupeLocations } from "./dedupeLocations";
import { Announcement, ClubEvent, DevelopmentPlan, Player } from "@/types/db";
import { useAsyncData } from "./asyncData";

export type AnnouncementWithRead = Announcement & { isRead: boolean };

export function useNextEvent() {
  const { profile } = useAuth();
  const clubId = profile?.club_id;

  const {
    data: event,
    loading,
    error,
    retry,
  } = useAsyncData<ClubEvent | null>(
    async () => {
      if (!clubId) return null;
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("club_id", clubId)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ClubEvent | null) ?? null;
    },
    [clubId],
    null,
  );

  return { event, loading, error, refresh: retry };
}

interface ClubBio {
  crestUrl: string | null;
  bio: string | null;
}

const EMPTY_CLUB_BIO: ClubBio = { crestUrl: null, bio: null };

export function useClubBio() {
  const { profile } = useAuth();
  const clubId = profile?.club_id;

  const { data, loading, error, retry } = useAsyncData<ClubBio>(
    async () => {
      if (!clubId) return EMPTY_CLUB_BIO;
      const { data, error } = await supabase.from("clubs").select("crest_url, bio").eq("id", clubId).maybeSingle();
      if (error) throw error;
      return { crestUrl: data?.crest_url ?? null, bio: data?.bio ?? null };
    },
    [clubId],
    EMPTY_CLUB_BIO,
  );

  return { crestUrl: data.crestUrl, bio: data.bio, loading, error, refresh: retry };
}

const EMPTY_WEEK_COUNTS = { games: 0, practices: 0, tournaments: 0, clubEvents: 0 };

export function useWeekCounts() {
  const { profile } = useAuth();
  const clubId = profile?.club_id;

  const {
    data: counts,
    loading,
    error,
    retry,
  } = useAsyncData(
    async () => {
      if (!clubId) return EMPTY_WEEK_COUNTS;
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from("events")
        .select("type")
        .eq("club_id", clubId)
        .gte("starts_at", now.toISOString())
        .lte("starts_at", weekFromNow.toISOString());
      if (error) throw error;
      const tally = { ...EMPTY_WEEK_COUNTS };
      (data ?? []).forEach((e: { type: string }) => {
        if (e.type === "game") tally.games++;
        else if (e.type === "practice") tally.practices++;
        else if (e.type === "tournament") tally.tournaments++;
        else tally.clubEvents++;
      });
      return tally;
    },
    [clubId],
    EMPTY_WEEK_COUNTS,
  );

  return { counts, loading, error, refresh: retry };
}

export function useRecentAnnouncements(limit = 5) {
  const { profile } = useAuth();
  const clubId = profile?.club_id;
  const userId = profile?.id;
  // Dashboard and the Announcements section both use this hook and can be
  // mounted at the same time (tabs stay mounted in the background), so the
  // realtime channel name needs a per-instance suffix — otherwise two
  // instances race to subscribe under the identical channel name and
  // Supabase throws "cannot add postgres_changes callbacks after subscribe()".
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  const {
    data: announcements,
    loading,
    error,
    retry,
    setData: setAnnouncements,
  } = useAsyncData<AnnouncementWithRead[]>(
    async () => {
      if (!clubId) return [];
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (data as Announcement[]) ?? [];

      let readIds = new Set<string>();
      if (rows.length && userId) {
        const { data: reads, error: readsError } = await supabase
          .from("announcement_reads")
          .select("announcement_id")
          .eq("user_id", userId)
          .in(
            "announcement_id",
            rows.map((r) => r.id),
          );
        if (readsError) throw readsError;
        readIds = new Set((reads ?? []).map((r) => r.announcement_id));
      }

      return rows.map((r) => ({ ...r, isRead: readIds.has(r.id) }));
    },
    [clubId, userId, limit],
    [],
  );

  // Realtime: a newly posted announcement shows up (as unread) without a
  // manual pull-to-refresh, same as a new message landing in GroupMe/TeamSnap.
  useEffect(() => {
    if (!clubId) return;
    const channel = supabase
      .channel(`announcements-${clubId}-${instanceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements", filter: `club_id=eq.${clubId}` }, () => retry())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clubId, retry, instanceId]);

  const markAsRead = useCallback(
    async (announcementId: string) => {
      if (!userId) return;
      setAnnouncements((prev) => prev.map((a) => (a.id === announcementId ? { ...a, isRead: true } : a)));
      await supabase
        .from("announcement_reads")
        .upsert({ announcement_id: announcementId, user_id: userId }, { onConflict: "announcement_id,user_id" });
    },
    [userId, setAnnouncements],
  );

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    const unreadIds = announcements.filter((a) => !a.isRead).map((a) => a.id);
    if (!unreadIds.length) return;
    setAnnouncements((prev) => prev.map((a) => ({ ...a, isRead: true })));
    await supabase.from("announcement_reads").upsert(
      unreadIds.map((id) => ({ announcement_id: id, user_id: userId })),
      { onConflict: "announcement_id,user_id" },
    );
  }, [userId, announcements, setAnnouncements]);

  return { announcements, loading, error, refresh: retry, markAsRead, markAllAsRead };
}

// Lightweight unread count for the tab bar badge — fetches just ids, not full
// announcement rows, and stays live via the same realtime pattern. A failed
// fetch here just leaves the badge at 0 rather than surfacing an error state
// -- a stale/missing badge count is low-stakes compared to the data losses
// this phase targets, so it's not worth a dedicated error UI.
export function useUnreadAnnouncementsCount(): number {
  const { profile } = useAuth();
  const clubId = profile?.club_id;
  const userId = profile?.id;
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  const { data: count, retry } = useAsyncData<number>(
    async () => {
      if (!clubId || !userId) return 0;
      const [{ data: all, error: allError }, { data: reads, error: readsError }] = await Promise.all([
        supabase.from("announcements").select("id").eq("club_id", clubId),
        supabase.from("announcement_reads").select("announcement_id").eq("user_id", userId),
      ]);
      if (allError) throw allError;
      if (readsError) throw readsError;
      const readIds = new Set((reads ?? []).map((r) => r.announcement_id));
      return (all ?? []).filter((a) => !readIds.has(a.id)).length;
    },
    [clubId, userId],
    0,
  );

  useEffect(() => {
    if (!clubId) return;
    const channel = supabase
      .channel(`announcements-badge-${clubId}-${instanceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements", filter: `club_id=eq.${clubId}` }, () => retry())
      .on("postgres_changes", { event: "*", schema: "public", table: "announcement_reads", filter: `user_id=eq.${userId}` }, () => retry())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clubId, userId, retry, instanceId]);

  return count;
}

export function useMyPlayers() {
  const { profile } = useAuth();
  const userId = profile?.id;

  const {
    data: players,
    loading,
    error,
    retry,
  } = useAsyncData<Player[]>(
    async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from("players").select("*").eq("parent_id", userId).is("archived_at", null);
      if (error) throw error;
      return (data as Player[]) ?? [];
    },
    [userId],
    [],
  );

  return { players, loading, error, refresh: retry };
}

export function useLatestDevelopmentPlan(playerId?: string) {
  const {
    data: plan,
    loading,
    error,
    retry,
  } = useAsyncData<DevelopmentPlan | null>(
    async () => {
      if (!playerId) return null;
      const { data, error } = await supabase
        .from("development_plans")
        .select("*")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as DevelopmentPlan | null) ?? null;
    },
    [playerId],
    null,
  );

  return { plan, loading, error, refresh: retry };
}

/**
 * Distinct venues this club has used before, most-recent first — powers the
 * location suggestion chips on the event form. A read of existing `events`
 * rows only: no schema change, no migration, and no hardcoded fallback city
 * (a club's own history is always right; a hardcoded one wouldn't be).
 */
export function useRecentLocations(limit = 6) {
  const { profile } = useAuth();
  const clubId = profile?.club_id;

  const {
    data: locations,
    loading,
    error,
    retry,
  } = useAsyncData<string[]>(
    async () => {
      if (!clubId) return [];
      const { data, error } = await supabase
        .from("events")
        .select("location")
        .eq("club_id", clubId)
        .not("location", "is", null)
        // "Recent" means recently entered, not furthest in the future — a club
        // with a season already on the calendar would otherwise be offered the
        // venues of its most distant fixtures. The cap keeps this from pulling
        // a whole season's rows to derive a handful of strings.
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data as { location: string | null }[]) ?? [];
      return dedupeLocations(
        rows.map((r) => r.location),
        limit,
      );
    },
    [clubId, limit],
    [],
  );

  return { locations, loading, error, refresh: retry };
}

export interface SetupStep {
  key: "club" | "team" | "players" | "practice";
  title: string;
  /** Shown under the title once complete, e.g. the club's name. */
  detail?: string;
  done: boolean;
  /** Where tapping it should go. */
  href: string;
}

interface SetupProgressData {
  steps: SetupStep[];
  teamCount: number;
  playerCount: number;
}

const EMPTY_SETUP_PROGRESS: SetupProgressData = { steps: [], teamCount: 0, playerCount: 0 };

/**
 * Derives the four-step "getting started" checklist a newly-onboarded
 * director sees on the dashboard, purely from existing tables — no schema
 * change. Each step after "club" is a cheap existence check (`count: "exact",
 * head: true`) rather than a full row fetch, since all the checklist needs is
 * whether at least one non-archived row exists.
 */
export function useSetupProgress() {
  const { profile } = useAuth();
  const clubId = profile?.club_id;
  const role = profile?.role;

  const { data, loading, error, retry } = useAsyncData<SetupProgressData>(
    async () => {
      // Team/player creation is director-gated in RLS ("teams_write_staff",
      // "players_insert_staff" both require role = 'director'), and this
      // checklist only ever points at those actions — so a coach or parent
      // gets an empty checklist rather than four queries they have no use for.
      if (!clubId || role !== "director") return EMPTY_SETUP_PROGRESS;

      const [clubResult, teamResult, playerResult, eventResult] = await Promise.all([
        supabase.from("clubs").select("name").eq("id", clubId).maybeSingle(),
        supabase.from("teams").select("id", { count: "exact", head: true }).eq("club_id", clubId).is("archived_at", null),
        supabase
          .from("players")
          .select("id, teams!inner(club_id)", { count: "exact", head: true })
          .eq("teams.club_id", clubId)
          .is("archived_at", null),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("club_id", clubId),
      ]);
      if (clubResult.error) throw clubResult.error;
      if (teamResult.error) throw teamResult.error;
      if (playerResult.error) throw playerResult.error;
      if (eventResult.error) throw eventResult.error;

      const clubName = (clubResult.data as { name: string } | null)?.name;
      const teamCount = teamResult.count ?? 0;
      const playerCount = playerResult.count ?? 0;

      const steps: SetupStep[] = [
        {
          key: "club",
          title: "Create Club Profile",
          detail: clubName ? `${clubName} established` : undefined,
          done: true,
          href: "/profile",
        },
        { key: "team", title: "Setup your first team", done: teamCount > 0, href: "/club-management" },
        { key: "players", title: "Add your roster", done: playerCount > 0, href: "/(tabs)/players" },
        {
          // Counts any event, not just type = 'practice', so the label has to
          // match: a director whose first booking is a game or a club social
          // has scheduled something and shouldn't still be nagged.
          key: "practice",
          title: "Schedule your first session",
          done: (eventResult.count ?? 0) > 0,
          href: "/modals/create-event",
        },
      ];

      return { steps, teamCount, playerCount };
    },
    [clubId, role],
    EMPTY_SETUP_PROGRESS,
  );

  // Focus, not mount: expo-router keeps tab screens mounted, so a director who
  // creates their first team and comes back would otherwise still be told to
  // "Setup your first team" until the app was relaunched. Every step in this
  // checklist is completed on a different screen, so re-deriving on focus is
  // the whole point. club-management and the Players tab do the same.
  useFocusEffect(
    useCallback(() => {
      retry();
    }, [retry]),
  );

  const completed = data.steps.filter((s) => s.done).length;
  const total = data.steps.length;

  return {
    steps: data.steps,
    completed,
    total,
    allDone: total > 0 && completed === total,
    loading,
    error,
    teamCount: data.teamCount,
    playerCount: data.playerCount,
    refresh: retry,
  };
}
