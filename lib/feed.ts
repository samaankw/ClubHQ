import { Announcement, ClubEvent } from "@/types/db";
import { ANNOUNCEMENT_CATEGORIES, FilterBucket } from "./announcementCategories";

export type AnnouncementWithRead = Announcement & { isRead: boolean };

/**
 * Anything the feed can show. Day headers are rows too — mixing events and
 * announcements means the list can't be a SectionList (a single calendar day
 * can hold both), so the headers get flattened into the data array.
 */
export type FeedItem =
  | { kind: "header"; id: string; label: string; isNow: boolean }
  | { kind: "event"; id: string; at: Date; event: ClubEvent }
  | { kind: "announcement"; id: string; at: Date; announcement: AnnouncementWithRead };

/**
 * "Sessions" is the pseudo-bucket for real calendar events. Every other value
 * is one of the existing announcement buckets, so a single chip row filters
 * both content types without re-introducing the Events/Announcements toggle.
 */
export type FeedFilter = "all" | "sessions" | FilterBucket;

export const FEED_FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sessions", label: "Sessions" },
  { key: "schedule", label: "Schedule" },
  { key: "weather", label: "Weather" },
  { key: "training", label: "Training" },
  { key: "events", label: "Programs" },
  { key: "general", label: "General" },
];

/**
 * How far back a plain, unfiltered feed reaches. Events are always shown from
 * now forward, but announcements accumulate, and 50 of them stacked above
 * today's session would bury the thing people opened the tab to see.
 * Searching or picking a filter lifts the window — see buildFeed.
 */
export const RECENT_WINDOW_DAYS = 14;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayLabel(date: Date, now: Date): string {
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export interface BuildFeedInput {
  events: ClubEvent[];
  announcements: AnnouncementWithRead[];
  filter: FeedFilter;
  query: string;
  now: Date;
}

/**
 * Merges events and announcements onto one time axis.
 *
 * The two content types point in opposite temporal directions — an event
 * matters at starts_at (future), an announcement matters from created_at
 * (past) — so the feed sorts ascending on "the moment this matters" and
 * renders recent context above today, upcoming sessions below it. Pinned
 * announcements break the ordering on purpose and sit at the very top.
 *
 * Pure function, no hooks or Supabase — this is the part worth testing.
 */
export function buildFeed({ events, announcements, filter, query, now }: BuildFeedInput): FeedItem[] {
  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;
  const isFiltered = filter !== "all";
  // A deliberate search or filter means the user is looking for something
  // specific, so the recency window stops applying.
  const windowed = !isSearching && !isFiltered;
  const cutoff = now.getTime() - RECENT_WINDOW_DAYS * 86_400_000;

  const matchesAnnouncement = (a: AnnouncementWithRead): boolean => {
    if (filter === "sessions") return false;
    if (filter !== "all" && ANNOUNCEMENT_CATEGORIES[a.category]?.bucket !== filter) return false;
    if (q && !`${a.title} ${a.body}`.toLowerCase().includes(q)) return false;
    return true;
  };

  const matchesEvent = (e: ClubEvent): boolean => {
    // Events carry no announcement category, so any category-specific filter
    // necessarily excludes them.
    if (filter !== "all" && filter !== "sessions") return false;
    if (q && !`${e.title} ${e.location ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  };

  const pinned: FeedItem[] = [];
  const timeline: Exclude<FeedItem, { kind: "header" }>[] = [];

  for (const a of announcements) {
    if (!matchesAnnouncement(a)) continue;
    const at = new Date(a.created_at);
    const item = { kind: "announcement" as const, id: `a-${a.id}`, at, announcement: a };
    if (a.pinned) {
      pinned.push(item);
      continue;
    }
    if (windowed && at.getTime() < cutoff) continue;
    timeline.push(item);
  }

  for (const e of events) {
    if (!matchesEvent(e)) continue;
    timeline.push({ kind: "event", id: `e-${e.id}`, at: new Date(e.starts_at), event: e });
  }

  timeline.sort((x, y) => x.at.getTime() - y.at.getTime());

  const out: FeedItem[] = [];
  if (pinned.length) {
    out.push({ kind: "header", id: "h-pinned", label: "Pinned", isNow: false });
    out.push(...pinned);
  }

  let lastDay: number | null = null;
  for (const item of timeline) {
    const day = startOfDay(item.at);
    if (day !== lastDay) {
      out.push({
        kind: "header",
        id: `h-${day}`,
        label: dayLabel(item.at, now),
        isNow: day === startOfDay(now),
      });
      lastDay = day;
    }
    out.push(item);
  }

  return out;
}

/**
 * Older builds deep-linked to ?section=events / ?section=announcements from
 * push notifications, the event detail screen, and both create modals. Those
 * links still resolve — they just pick a filter now instead of a tab panel.
 */
export function filterFromSectionParam(section?: string): FeedFilter {
  if (section === "events") return "sessions";
  return "all";
}
