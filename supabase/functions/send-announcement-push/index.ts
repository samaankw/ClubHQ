// Supabase Edge Function (Deno)
// Deploy with: supabase functions deploy send-announcement-push
// No extra secrets required — only SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY,
// which every Edge Function gets automatically.
//
// Input JSON body: { announcementId: string }
// Called right after an announcement insert succeeds (see
// app/modals/create-announcement.tsx). Only the announcement's own author
// can trigger this for it — verified server-side from the caller's JWT.
//
// Recipient targeting deliberately mirrors the "announcements_read" RLS
// policy (supabase/migrations/0010_product_readiness.sql) exactly:
//   - team_id is null (club-wide)  -> every profile in the club
//   - team_id is set               -> club staff (coach/director) + parents
//                                      of players on that specific team
// If that policy ever changes, this targeting logic needs to change with it
// or pushes will go to people who can't actually see the announcement.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { authenticate, enforceRateLimit, errorResponse, AuthError } from "../_shared/auth.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  buildPushMessages,
  chunkMessages,
  collectPushTokens,
  EXPO_PUSH_URL,
  filterOptedIn,
  PushableAnnouncement,
  resolveRecipientIds,
} from "../_shared/announcementPush.ts";

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  try {
    const caller = await authenticate(req);
    // Posting announcements is already staff-only at the DB level; this is
    // just a fast-fail before doing any work.
    if (caller.role !== "coach" && caller.role !== "director") {
      throw new AuthError("Only coaches and directors can send announcement notifications.", 403);
    }
    // One push fan-out per announcement post — staff don't post dozens an hour.
    await enforceRateLimit(caller, "send-announcement-push", 30, 60);

    const { announcementId } = await req.json();
    if (!announcementId) {
      return new Response(JSON.stringify({ error: "announcementId is required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = caller.admin;

    const { data: announcement, error: annErr } = await supabase
      .from("announcements")
      .select("id, club_id, team_id, author_id, title, body, pinned, target_type")
      .eq("id", announcementId)
      .single();
    if (annErr || !announcement) throw annErr ?? new Error("Announcement not found");

    // Only the person who wrote it can trigger its notification fan-out —
    // stops anyone else from spamming pushes by guessing an announcement id.
    if (announcement.author_id !== caller.userId) {
      throw new AuthError("You can only send notifications for announcements you posted.", 403);
    }
    if (announcement.club_id !== caller.clubId) {
      throw new AuthError("That announcement isn't part of your club.", 403);
    }

    const [{ data: author }, { data: club }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", announcement.author_id).single(),
      supabase.from("clubs").select("name").eq("id", announcement.club_id).single(),
    ]);

    let teamName: string | null = null;
    if (announcement.team_id) {
      const { data: team } = await supabase.from("teams").select("name").eq("id", announcement.team_id).single();
      teamName = team?.name ?? null;
    }

    // ---- Recipient targeting (mirrors announcements_read RLS — see header) ----
    // Lives in ../_shared/announcementPush.ts so it can be tested directly;
    // see supabase/functions/tests/announcement_push_test.ts.
    const recipientIds = await resolveRecipientIds(
      supabase,
      announcement as PushableAnnouncement
    );

    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_recipients" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Respect each recipient's own preference before sending anything —
    // someone who muted announcement pushes should still see it in-app,
    // just not get pinged for it.
    const notifiableIds = await filterOptedIn(supabase, recipientIds);
    if (notifiableIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_recipients_opted_in" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const tokens = await collectPushTokens(supabase, notifiableIds);
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_push_tokens" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const messages = buildPushMessages({
      tokens,
      announcement: announcement as PushableAnnouncement,
      authorName: author?.full_name ?? null,
      teamName,
      clubName: club?.name ?? null,
    });

    let sent = 0;
    for (const batch of chunkMessages(messages)) {
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

    return new Response(JSON.stringify({ sent, recipients: recipientIds.length }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
