import { buildFeed, dayLabel, filterFromSectionParam, RECENT_WINDOW_DAYS, FeedItem, AnnouncementWithRead } from "./feed";
import { ClubEvent } from "@/types/db";

// Fixed reference point so every test is deterministic regardless of when
// the suite actually runs. Wednesday, June 11 2025, 12:00 local.
const NOW = new Date(2025, 5, 11, 12, 0, 0);

function hoursFromNow(h: number): Date {
  return new Date(NOW.getTime() + h * 60 * 60 * 1000);
}
function daysFromNow(d: number): Date {
  return new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000);
}

let eventSeq = 0;
function makeEvent(overrides: Partial<ClubEvent> = {}): ClubEvent {
  eventSeq += 1;
  return {
    id: `event-${eventSeq}`,
    club_id: "club-1",
    type: "practice",
    title: `Event ${eventSeq}`,
    starts_at: hoursFromNow(1).toISOString(),
    created_by: "coach-1",
    ...overrides,
  };
}

let annSeq = 0;
function makeAnnouncement(overrides: Partial<AnnouncementWithRead> = {}): AnnouncementWithRead {
  annSeq += 1;
  return {
    id: `ann-${annSeq}`,
    club_id: "club-1",
    author_id: "coach-1",
    title: `Announcement ${annSeq}`,
    body: "Body text",
    pinned: false,
    category: "general",
    target_type: "everyone",
    created_at: NOW.toISOString(),
    isRead: false,
    ...overrides,
  };
}

beforeEach(() => {
  eventSeq = 0;
  annSeq = 0;
});

describe("buildFeed: chronological merge", () => {
  test("interleaves events and announcements on one ascending time axis", () => {
    const e1 = makeEvent({ starts_at: daysFromNow(2).toISOString(), title: "Later practice" });
    const a1 = makeAnnouncement({ created_at: daysFromNow(1).toISOString(), title: "Middle announcement" });
    const e2 = makeEvent({ starts_at: NOW.toISOString(), title: "Earliest event" });

    const feed = buildFeed({ events: [e1, e2], announcements: [a1], filter: "all", query: "", now: NOW });
    const order = feed
      .filter((i) => i.kind !== "header")
      .map((i) => (i.kind === "event" ? i.event.title : i.kind === "announcement" ? i.announcement.title : ""));

    expect(order).toEqual(["Earliest event", "Middle announcement", "Later practice"]);
  });

  test("empty input produces an empty feed, not an error", () => {
    expect(buildFeed({ events: [], announcements: [], filter: "all", query: "", now: NOW })).toEqual([]);
  });
});

describe("buildFeed: day headers", () => {
  test("labels Today/Tomorrow/Yesterday correctly and marks isNow only on today's header", () => {
    const events = [
      makeEvent({ starts_at: daysFromNow(-1).toISOString() }),
      makeEvent({ starts_at: NOW.toISOString() }),
      makeEvent({ starts_at: daysFromNow(1).toISOString() }),
    ];
    const feed = buildFeed({ events, announcements: [], filter: "all", query: "", now: NOW });
    const headers = feed.filter((i): i is Extract<FeedItem, { kind: "header" }> => i.kind === "header");

    expect(headers.map((h) => h.label)).toEqual(["Yesterday", "Today", "Tomorrow"]);
    expect(headers.map((h) => h.isNow)).toEqual([false, true, false]);
  });

  test("one header per calendar day even with multiple items that day", () => {
    const events = [makeEvent({ starts_at: hoursFromNow(1).toISOString() }), makeEvent({ starts_at: hoursFromNow(3).toISOString() })];
    const feed = buildFeed({ events, announcements: [], filter: "all", query: "", now: NOW });
    expect(feed.filter((i) => i.kind === "header")).toHaveLength(1);
  });

  test("a far-future date includes the year; a same-year date doesn't", () => {
    const sameYear = dayLabel(new Date(2025, 8, 20), NOW);
    const nextYear = dayLabel(new Date(2026, 2, 3), NOW);
    expect(sameYear).not.toMatch(/2025/);
    expect(nextYear).toMatch(/2026/);
  });
});

describe("buildFeed: pinned announcements", () => {
  test("pinned announcements get their own leading section regardless of date", () => {
    const old = makeAnnouncement({ pinned: true, created_at: daysFromNow(-100).toISOString(), title: "Old pinned" });
    const soon = makeEvent({ starts_at: daysFromNow(1).toISOString() });
    const feed = buildFeed({ events: [soon], announcements: [old], filter: "all", query: "", now: NOW });

    expect(feed[0]).toMatchObject({ kind: "header", id: "h-pinned" });
    expect(feed[1]).toMatchObject({ kind: "announcement", announcement: { title: "Old pinned" } });
  });

  test("a pinned announcement outside the recency window still appears (pinning bypasses the window)", () => {
    const old = makeAnnouncement({ pinned: true, created_at: daysFromNow(-(RECENT_WINDOW_DAYS + 30)).toISOString() });
    const feed = buildFeed({ events: [], announcements: [old], filter: "all", query: "", now: NOW });
    expect(feed.some((i) => i.kind === "announcement" && i.announcement.id === old.id)).toBe(true);
  });
});

describe("buildFeed: recency window", () => {
  test("an unpinned announcement older than the window is dropped when unfiltered", () => {
    const old = makeAnnouncement({ created_at: daysFromNow(-(RECENT_WINDOW_DAYS + 1)).toISOString() });
    const feed = buildFeed({ events: [], announcements: [old], filter: "all", query: "", now: NOW });
    expect(feed).toHaveLength(0);
  });

  test("an announcement just inside the window survives", () => {
    const recent = makeAnnouncement({ created_at: daysFromNow(-(RECENT_WINDOW_DAYS - 1)).toISOString() });
    const feed = buildFeed({ events: [], announcements: [recent], filter: "all", query: "", now: NOW });
    expect(feed.some((i) => i.kind === "announcement")).toBe(true);
  });

  test("searching lifts the window entirely", () => {
    const old = makeAnnouncement({ created_at: daysFromNow(-(RECENT_WINDOW_DAYS + 30)).toISOString(), title: "Ancient but findable" });
    const feed = buildFeed({ events: [], announcements: [old], filter: "all", query: "ancient", now: NOW });
    expect(feed.some((i) => i.kind === "announcement" && i.announcement.title === "Ancient but findable")).toBe(true);
  });

  test("picking a category filter also lifts the window", () => {
    const old = makeAnnouncement({ created_at: daysFromNow(-(RECENT_WINDOW_DAYS + 30)).toISOString(), category: "weather" });
    const feed = buildFeed({ events: [], announcements: [old], filter: "weather", query: "", now: NOW });
    expect(feed.some((i) => i.kind === "announcement")).toBe(true);
  });

  test("events are never subject to the recency window, past or future", () => {
    const longPast = makeEvent({ starts_at: daysFromNow(-(RECENT_WINDOW_DAYS + 60)).toISOString() });
    const feed = buildFeed({ events: [longPast], announcements: [], filter: "all", query: "", now: NOW });
    expect(feed.some((i) => i.kind === "event")).toBe(true);
  });
});

describe("buildFeed: search", () => {
  test("matches announcement title or body, case-insensitively", () => {
    const a = makeAnnouncement({ title: "Fields Closed", body: "Due to Weather" });
    const b = makeAnnouncement({ title: "Unrelated", body: "Nothing to do with it" });
    const feed = buildFeed({ events: [], announcements: [a, b], filter: "all", query: "weather", now: NOW });
    const titles = feed
      .filter((i) => i.kind === "announcement")
      .map((i) => (i as Extract<FeedItem, { kind: "announcement" }>).announcement.title);
    expect(titles).toEqual(["Fields Closed"]);
  });

  test("matches event title or location, case-insensitively", () => {
    const e1 = makeEvent({ title: "Practice", location: "Dunwoody Fields" });
    const e2 = makeEvent({ title: "Practice", location: "Snellville Fields" });
    const feed = buildFeed({ events: [e1, e2], announcements: [], filter: "all", query: "dunwoody", now: NOW });
    expect(feed.filter((i) => i.kind === "event")).toHaveLength(1);
  });

  test("a query matching nothing returns an empty feed", () => {
    const feed = buildFeed({ events: [makeEvent()], announcements: [makeAnnouncement()], filter: "all", query: "xyz-no-match", now: NOW });
    expect(feed).toHaveLength(0);
  });
});

describe("buildFeed: type filtering", () => {
  test("'sessions' shows events, excludes every announcement", () => {
    const feed = buildFeed({ events: [makeEvent()], announcements: [makeAnnouncement()], filter: "sessions", query: "", now: NOW });
    expect(feed.some((i) => i.kind === "announcement")).toBe(false);
    expect(feed.some((i) => i.kind === "event")).toBe(true);
  });

  test("a specific announcement bucket excludes events entirely", () => {
    const feed = buildFeed({
      events: [makeEvent()],
      announcements: [makeAnnouncement({ category: "weather" })],
      filter: "weather",
      query: "",
      now: NOW,
    });
    expect(feed.some((i) => i.kind === "event")).toBe(false);
  });

  test("a specific bucket only matches announcements whose category maps to it", () => {
    const weatherAnn = makeAnnouncement({ category: "weather" });
    const generalAnn = makeAnnouncement({ category: "general" });
    const feed = buildFeed({ events: [], announcements: [weatherAnn, generalAnn], filter: "weather", query: "", now: NOW });
    expect(feed.filter((i) => i.kind === "announcement")).toHaveLength(1);
  });
});

describe("buildFeed: malformed/edge input the function intentionally tolerates", () => {
  test("a category not present in ANNOUNCEMENT_CATEGORIES doesn't throw, and never matches a specific filter", () => {
    // Cast past the union on purpose -- this simulates a category value the
    // client's lookup table hasn't caught up with, e.g. a category added on
    // the DB side (an enum extension) that a stale client build doesn't know
    // about yet. The optional-chaining in matchesAnnouncement is what's
    // actually under test here.
    const unknownCategoryAnn = makeAnnouncement({ category: "not_a_real_category" as AnnouncementWithRead["category"] });
    expect(() => buildFeed({ events: [], announcements: [unknownCategoryAnn], filter: "weather", query: "", now: NOW })).not.toThrow();
    const feed = buildFeed({ events: [], announcements: [unknownCategoryAnn], filter: "weather", query: "", now: NOW });
    expect(feed.some((i) => i.kind === "announcement")).toBe(false);
  });

  test("an empty/whitespace-only query behaves like no search at all", () => {
    const old = makeAnnouncement({ created_at: daysFromNow(-(RECENT_WINDOW_DAYS + 30)).toISOString() });
    const feed = buildFeed({ events: [], announcements: [old], filter: "all", query: "   ", now: NOW });
    // Whitespace trims to empty, so this is NOT a search -- the recency
    // window still applies and the old item is dropped.
    expect(feed).toHaveLength(0);
  });
});

describe("filterFromSectionParam", () => {
  test('"events" maps to the sessions filter', () => {
    expect(filterFromSectionParam("events")).toBe("sessions");
  });

  test("undefined maps to all", () => {
    expect(filterFromSectionParam(undefined)).toBe("all");
  });

  // KNOWN GAP, documented rather than silently left uncovered: old push
  // notifications/deep links used ?section=announcements (see the comment
  // above filterFromSectionParam in feed.ts). There is no FeedFilter value
  // meaning "every announcement, no sessions" -- the closest is "all", which
  // also shows sessions. This test pins down what actually happens today so
  // a future change to this function is a deliberate decision, not a silent
  // regression either way.
  test('"announcements" currently falls through to "all", not an announcements-only filter', () => {
    expect(filterFromSectionParam("announcements")).toBe("all");
  });

  test("an unrecognized section string also falls through to all", () => {
    expect(filterFromSectionParam("something-else")).toBe("all");
  });
});
