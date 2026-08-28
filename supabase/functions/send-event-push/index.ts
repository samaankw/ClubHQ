// Supabase Edge Function (Deno)
// Deploy with: supabase functions deploy send-event-push
// No extra secrets required — only SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY,
// which every Edge Function gets automatically.
//
// Input JSON body: { eventId: string, isUpdate?: boolean }
// Called right after an event insert OR edit succeeds (see
// app/modals/create-event.tsx). isUpdate just changes the notification
// wording ("updated" vs "added") — a coach moving practice from 5pm to 6pm
// needs parents to actually find out, not just the people who happened to
// reopen the app. Anyone who could edit the event (creator, director, or a
// coach assigned to its team — matches the events_update RLS policy) can
// trigger this, not only the original creator.
//
// Recipient targeting deliberately mirrors the "events_read" RLS policy
// (supabase/migrations/0021_event_multi_player_targeting.sql) exactly:
//   - no team_id and no event_players rows -> club-wide -> every profile in the club
//   - team_id and/or event_players set     -> club staff (coach/director), plus
//                                              parents of the specific targeted
//                                              players if any are set, otherwise
//                                              parents of everyone on that team
// If that policy ever changes, this targeting logic needs to change with it
// or pushes will go to people who can't actually see the event.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { authenticate, enforceRateLimit, errorResponse, AuthError } from "../_shared/auth.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_BATCH_SIZE = 100; // Expo's documented per-request limit

// All current locations (Dunwoody, Snellville, Stone Mountain) are Atlanta
// suburbs in the same timezone — hardcoded rather than derived per-club since
// there's only one club today. Revisit if ClubHQ ever supports clubs outside
// America/New_York.
const CLUB_TIME_ZONE = "America/New_York";

const TYPE_LABEL: Record<string, string> = {
  practice: "Practice",
  game: "Game",
  tournament: "Tournament",
  club_event: "Event",
};

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  try {
    const caller = await authenticate(req);
    if (caller.role !== "coach" && caller.role !== "director") {
      throw new AuthError("Only coaches and directors can send event notifications.", 403);
    }
    await enforceRateLimit(caller, "send-event-push", 30, 60);

    const { eventId, isUpdate } = await req.json();
    if (!eventId) {
      return new Response(JSON.stringify({ error: "eventId is required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = caller.admin;

    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("id, club_id, team_id, type, title, location, starts_at, created_by")
      .eq("id", eventId)
      .single();
    if (eventErr || !event) throw eventErr ?? new Error("Event not found");

    if (event.club_id !== caller.clubId) {
      throw new AuthError("That event isn't part of your club.", 403);
    }

    // Matches events_update's RLS scope: the creator, a director, or a coach
    // assigned to the event's team — not just the original creator, since a
    // director editing a coach's event still needs to be able to re-notify.
    const isAuthorizedToNotify =
      event.created_by === caller.userId ||
      caller.role === "director" ||
      (event.team_id
        ? !!(
            await supabase
              .from("team_coaches")
              .select("team_id")
              .eq("team_id", event.team_id)
              .eq("coach_id", caller.userId)
              .maybeSingle()
          ).data
        : false);
    if (!isAuthorizedToNotify) {
      throw new AuthError("You can only send notifications for events you can edit.", 403);
    }

    const [{ data: club }, { data: targetRows }] = await Promise.all([
      supabase.from("clubs").select("name").eq("id", event.club_id).single(),
      supabase.from("event_players").select("players(parent_id)").eq("event_id", event.id),
    ]);

    let teamName: string | null = null;
    if (event.team_id) {
      const { data: team } = await supabase.from("teams").select("name, age_group").eq("id", event.team_id).single();
      teamName = team?.age_group?.trim() || team?.name || null;
    }

    const hasPlayerTargets = (targetRows ?? []).length > 0;

    // ---- Recipient targeting (mirrors events_read RLS — see header) ----
    const recipientIds = new Set<string>();

    if (!event.team_id && !hasPlayerTargets) {
      // True club-wide event.
      const { data: clubMembers } = await supabase
        .from("profiles")
        .select("id")
        .eq("club_id", event.club_id)
        .neq("id", caller.userId);
      (clubMembers ?? []).forEach((p) => recipientIds.add(p.id));
    } else {
      // Team, partial-team, or player-targeted/mixed-group session — staff
      // see every event regardless of targeting, so they're always included.
      const { data: staff } = await supabase
        .from("profiles")
        .select("id")
        .eq("club_id", event.club_id)
        .in("role", ["coach", "director"])
        .neq("id", caller.userId);
      (staff ?? []).forEach((p) => recipientIds.add(p.id));

      if (hasPlayerTargets) {
        (targetRows ?? []).forEach((t) => {
          const parentId = (t.players as unknown as { parent_id: string | null } | null)?.parent_id;
          if (parentId && parentId !== caller.userId) recipientIds.add(parentId);
        });
      } else if (event.team_id) {
        const { data: players } = await supabase
          .from("players")
          .select("parent_id")
          .eq("team_id", event.team_id)
          .not("parent_id", "is", null);
        (players ?? []).forEach((p) => {
          if (p.parent_id && p.parent_id !== caller.userId) recipientIds.add(p.parent_id);
        });
      }
    }

    if (recipientIds.size === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_recipients" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Respect each recipient's own preference before sending anything —
    // someone who muted event pushes should still see it in-app, just not
    // get pinged for it.
    const { data: optedIn } = await supabase
      .from("profiles")
      .select("id")
      .in("id", Array.from(recipientIds))
      .eq("notify_events", true);
    const notifiableIds = (optedIn ?? []).map((p) => p.id);
    if (notifiableIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_recipients_opted_in" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { data: tokenRows } = await supabase
      .from("push_tokens")
      .select("expo_push_token")
      .in("user_id", notifiableIds)
      .eq("enabled", true);

    const tokens = Array.from(new Set((tokenRows ?? []).map((t) => t.expo_push_token))).filter(Boolean);
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_push_tokens" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const when = new Date(event.starts_at).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: CLUB_TIME_ZONE,
    });

    const notifTitle = teamName ?? club?.name ?? "ClubHQ";
    const typeLabel = TYPE_LABEL[event.type] ?? "Event";
    const verb = isUpdate ? "updated" : "added";
    const notifBody = `${typeLabel} ${verb}: ${event.title} — ${when}${event.location ? ` @ ${event.location}` : ""}`;

    const messages = tokens.map((to) => ({
      to,
      title: notifTitle,
      body: notifBody,
      sound: "default",
      data: { type: "event", eventId: event.id, teamId: event.team_id },
    }));

    let sent = 0;
    for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_PUSH_BATCH_SIZE);
      const resp = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(batch),
      });
      if (resp.ok) {
        sent += batch.length;
      } else {
        console.error("Expo push batch failed:", await resp.text());
      }
    }

    return new Response(JSON.stringify({ sent, recipients: recipientIds.size }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
