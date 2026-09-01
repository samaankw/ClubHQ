// The recipient-selection and payload-building half of send-announcement-push,
// pulled out of the request handler so it can be tested without standing up an
// HTTP server or a Supabase project.
//
// This logic is worth isolating because it is the part that fails *quietly*.
// A wrong filter here doesn't error — it just pages the wrong parents, or
// nobody. That got sharper with the automatic notices in 0034/0035: nobody
// proof-reads a cancellation before it goes out, so the targeting is the only
// thing standing between a deleted session and forty misdirected phones.
//
// Everything here takes a `db` shaped like the PostgREST query builder rather
// than pre-fetched arrays, deliberately: most of the realistic mistakes are in
// the queries themselves (filtering on a null team_id, forgetting
// `.eq("enabled", true)`), and a test that only exercises the set arithmetic
// would miss all of them.

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_PUSH_BATCH_SIZE = 100; // Expo's documented per-request limit

export interface PushableAnnouncement {
  id: string;
  club_id: string;
  team_id: string | null;
  author_id: string;
  title: string;
  pinned: boolean;
  target_type: "everyone" | "team" | "players" | "parents";
}

// Structural type for the slice of the Supabase client used here. Keeps the
// module free of a hard dependency on supabase-js, which is what lets a test
// hand it an in-memory stand-in.
// deno-lint-ignore no-explicit-any
type Queryable = any;

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: string;
  data: { type: string; announcementId: string; teamId: string | null };
}

/**
 * Who should be pinged about this announcement.
 *
 * Mirrors the "announcements_read" RLS policy (0010, amended 0013). If that
 * policy changes, this changes with it, or pushes reach people who then tap
 * through to a row RLS won't hand them.
 *
 * The author is always excluded: a coach does not need their phone to buzz
 * about the session they just cancelled.
 */
export async function resolveRecipientIds(
  db: Queryable,
  announcement: PushableAnnouncement
): Promise<string[]> {
  const recipientIds = new Set<string>();

  if (announcement.target_type === "players" || announcement.target_type === "parents") {
    // Specific families only — a note to two players' parents shouldn't page
    // every coach's phone the way a club-wide post would.
    const { data: targets } = await db
      .from("announcement_player_targets")
      .select("players(parent_id)")
      .eq("announcement_id", announcement.id);
    for (const row of targets ?? []) {
      const parentId = (row.players as { parent_id: string | null } | null)?.parent_id;
      if (parentId && parentId !== announcement.author_id) recipientIds.add(parentId);
    }
  } else if (announcement.target_type === "everyone") {
    const { data: clubMembers } = await db
      .from("profiles")
      .select("id")
      .eq("club_id", announcement.club_id)
      .neq("id", announcement.author_id);
    for (const p of clubMembers ?? []) recipientIds.add(p.id);
  } else {
    // target_type === "team": club staff plus the parents of players on it.
    const [{ data: staff }, { data: players }] = await Promise.all([
      db
        .from("profiles")
        .select("id")
        .eq("club_id", announcement.club_id)
        .in("role", ["coach", "director"])
        .neq("id", announcement.author_id),
      db
        .from("players")
        .select("parent_id")
        .eq("team_id", announcement.team_id)
        .not("parent_id", "is", null),
    ]);
    for (const p of staff ?? []) recipientIds.add(p.id);
    for (const p of players ?? []) {
      if (p.parent_id && p.parent_id !== announcement.author_id) recipientIds.add(p.parent_id);
    }
  }

  return Array.from(recipientIds);
}

/**
 * Drops anyone who muted announcement pushes. They still see the notice in
 * the feed with an unread badge — muting the ping is not muting the news.
 */
export async function filterOptedIn(db: Queryable, recipientIds: string[]): Promise<string[]> {
  if (recipientIds.length === 0) return [];
  const { data } = await db
    .from("profiles")
    .select("id")
    .in("id", recipientIds)
    .eq("notify_announcements", true);
  return (data ?? []).map((p: { id: string }) => p.id);
}

/**
 * Registered device tokens for those recipients, deduplicated.
 *
 * `.eq("enabled", true)` is load-bearing: the column arrived in 0031 and rows
 * from before it are the reason push had never actually delivered. A parent
 * with two players on the same team also yields the same token twice, and
 * Expo would happily send them both.
 */
export async function collectPushTokens(db: Queryable, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data } = await db
    .from("push_tokens")
    .select("expo_push_token")
    .in("user_id", userIds)
    .eq("enabled", true);
  return Array.from(
    new Set((data ?? []).map((t: { expo_push_token: string }) => t.expo_push_token))
  ).filter(Boolean) as string[];
}

/**
 * Notification shape mirrors GroupMe/TeamSnap: the group is the title and the
 * body reads like a chat preview — "Coach Sam: Practice moved to 6pm" — rather
 * than a generic "New announcement" banner.
 */
export function buildPushMessages(args: {
  tokens: string[];
  announcement: PushableAnnouncement;
  authorName: string | null;
  teamName: string | null;
  clubName: string | null;
}): ExpoMessage[] {
  const { tokens, announcement, authorName, teamName, clubName } = args;
  const pinPrefix = announcement.pinned ? "📌 " : "";
  const title = teamName ?? clubName ?? "ClubHQ";
  const body = `${pinPrefix}${authorName ?? "Someone"}: ${announcement.title}`;

  return tokens.map((to) => ({
    to,
    title,
    body,
    sound: "default",
    data: {
      type: "announcement",
      announcementId: announcement.id,
      teamId: announcement.team_id,
    },
  }));
}

/** Expo caps a request at 100 messages, so anything larger goes in chunks. */
export function chunkMessages(
  messages: ExpoMessage[],
  size: number = EXPO_PUSH_BATCH_SIZE
): ExpoMessage[][] {
  const batches: ExpoMessage[][] = [];
  for (let i = 0; i < messages.length; i += size) {
    batches.push(messages.slice(i, i + size));
  }
  return batches;
}
