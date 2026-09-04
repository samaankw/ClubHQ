// Supabase Edge Function (Deno)
// Returns a portable JSON export of data attributable to the authenticated
// adult. Parent exports also include records for children CURRENTLY linked to
// that parent; withdrawn/unlinked child records are intentionally not exposed.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { authenticate, errorResponse } from "../_shared/auth.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  try {
    const caller = await authenticate(req);
    const { data: authUser, error: authError } = await caller.admin.auth.admin.getUserById(caller.userId);
    if (authError) throw authError;

    const [profileResult, consentResult, messagesResult, announcementsResult, eventsResult, evaluationsResult, drillsResult, viewsResult, teamCoachResult] =
      await Promise.all([
        caller.admin.from("profiles").select("*").eq("id", caller.userId).maybeSingle(),
        caller.admin.from("consent_records").select("*").eq("subject_user_id", caller.userId).order("consented_at", { ascending: true }),
        caller.admin.from("messages").select("*").eq("sender_id", caller.userId).order("created_at", { ascending: true }),
        caller.admin.from("announcements").select("*").eq("author_id", caller.userId).order("created_at", { ascending: true }),
        caller.admin.from("events").select("*").eq("created_by", caller.userId).order("created_at", { ascending: true }),
        caller.admin.from("evaluations").select("*").eq("coach_id", caller.userId).order("created_at", { ascending: true }),
        caller.admin.from("drills").select("*").eq("added_by", caller.userId).order("created_at", { ascending: true }),
        caller.admin.from("report_views").select("*").eq("viewer_id", caller.userId).order("viewed_at", { ascending: true }),
        caller.admin.from("team_coaches").select("*").eq("coach_id", caller.userId),
      ]);

    for (const result of [
      profileResult,
      consentResult,
      messagesResult,
      announcementsResult,
      eventsResult,
      evaluationsResult,
      drillsResult,
      viewsResult,
      teamCoachResult,
    ]) {
      if (result.error) throw result.error;
    }

    let club: unknown = null;
    if (caller.clubId) {
      const clubResult = await caller.admin.from("clubs").select("id, name, org_type, timezone, created_at").eq("id", caller.clubId).maybeSingle();
      if (clubResult.error) throw clubResult.error;
      club = clubResult.data;
    }

    let linkedPlayerData: Record<string, unknown> | null = null;
    if (caller.role === "parent") {
      const playersResult = await caller.admin
        .from("players")
        .select("*")
        .eq("parent_id", caller.userId)
        .order("created_at", { ascending: true });
      if (playersResult.error) throw playersResult.error;

      const players = playersResult.data ?? [];
      const playerIds = players.map((player) => player.id);

      if (playerIds.length > 0) {
        const [playerEvaluations, plans, homework, rsvps, attendance, reportViews] = await Promise.all([
          caller.admin.from("evaluations").select("*").in("player_id", playerIds).order("created_at", { ascending: true }),
          caller.admin.from("development_plans").select("*").in("player_id", playerIds).order("created_at", { ascending: true }),
          caller.admin.from("homework_items").select("*").in("player_id", playerIds),
          caller.admin.from("event_rsvps").select("*").in("player_id", playerIds),
          caller.admin.from("attendance_records").select("*").in("player_id", playerIds),
          caller.admin.from("report_views").select("*").in("player_id", playerIds).order("viewed_at", { ascending: true }),
        ]);
        for (const result of [playerEvaluations, plans, homework, rsvps, attendance, reportViews]) {
          if (result.error) throw result.error;
        }
        linkedPlayerData = {
          players,
          evaluations: playerEvaluations.data ?? [],
          developmentPlans: plans.data ?? [],
          homework: homework.data ?? [],
          rsvps: rsvps.data ?? [],
          attendance: attendance.data ?? [],
          reportViews: reportViews.data ?? [],
        };
      } else {
        linkedPlayerData = { players: [] };
      }
    }

    const exportPayload = {
      exportVersion: "v1",
      generatedAt: new Date().toISOString(),
      scope: "Authenticated adult account data plus currently linked child records for parent accounts.",
      account: {
        id: caller.userId,
        email: authUser.user?.email ?? null,
        createdAt: authUser.user?.created_at ?? null,
        lastSignInAt: authUser.user?.last_sign_in_at ?? null,
      },
      profile: profileResult.data,
      organization: club,
      consentHistory: consentResult.data ?? [],
      authoredData: {
        messages: messagesResult.data ?? [],
        announcements: announcementsResult.data ?? [],
        events: eventsResult.data ?? [],
        evaluations: evaluationsResult.data ?? [],
        drills: drillsResult.data ?? [],
        reportViews: viewsResult.data ?? [],
        teamAssignments: teamCoachResult.data ?? [],
      },
      linkedPlayerData,
    };

    return new Response(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="clubhq-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
