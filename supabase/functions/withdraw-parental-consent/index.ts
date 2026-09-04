// Supabase Edge Function (Deno)
// Withdraws a parent's consent for one linked player. The live parent link is
// removed immediately so player-scoped access stops, while the consent ledger
// keeps the acceptance + withdrawal evidence added by migration 0043.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { authenticate, errorResponse, AuthError } from "../_shared/auth.ts";
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
    if (caller.role !== "parent") throw new AuthError("Only parent accounts can withdraw parental consent.", 403);

    const body = await req.json().catch(() => ({}));
    const playerId = typeof body?.playerId === "string" ? body.playerId : "";
    if (!playerId) throw new AuthError("A player ID is required.", 400);

    const { data: player, error: playerError } = await caller.admin
      .from("players")
      .select("id, parent_id")
      .eq("id", playerId)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player || player.parent_id !== caller.userId) {
      throw new AuthError("That player is not currently linked to your parent account.", 403);
    }

    const withdrawnAt = new Date().toISOString();
    const { data: consentRows, error: consentError } = await caller.admin
      .from("consent_records")
      .update({ status: "withdrawn", withdrawn_at: withdrawnAt })
      .eq("subject_user_id", caller.userId)
      .eq("subject_player_id", playerId)
      .eq("consent_type", "parental_data_consent")
      .eq("status", "active")
      .select("id");
    if (consentError) throw consentError;

    const { error: unlinkError } = await caller.admin
      .from("players")
      .update({ parent_id: null })
      .eq("id", playerId)
      .eq("parent_id", caller.userId);
    if (unlinkError) throw unlinkError;

    return new Response(
      JSON.stringify({
        withdrawn: true,
        withdrawnAt,
        consentRecordsUpdated: consentRows?.length ?? 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
});
