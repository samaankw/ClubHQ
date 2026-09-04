// Supabase Edge Function (Deno)
// Converts the terms acceptance already captured in Supabase Auth metadata at
// signup into a durable consent-ledger record. Safe to call on every session;
// it is idempotent for a given user + policy version.

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
    const { data: authUser, error: authError } = await caller.admin.auth.admin.getUserById(caller.userId);
    if (authError) throw authError;

    const metadata = authUser.user?.user_metadata ?? {};
    if (metadata.terms_accepted !== true) {
      throw new AuthError("No terms acceptance is recorded for this account.", 409);
    }

    const policyVersion = typeof metadata.terms_version === "string" && metadata.terms_version.trim()
      ? metadata.terms_version.trim()
      : "v2";

    const { data: existing, error: lookupError } = await caller.admin
      .from("consent_records")
      .select("id")
      .eq("subject_user_id", caller.userId)
      .eq("consent_type", "terms_and_privacy")
      .eq("policy_version", policyVersion)
      .limit(1);
    if (lookupError) throw lookupError;

    if ((existing?.length ?? 0) === 0) {
      const { error: insertError } = await caller.admin.from("consent_records").insert({
        user_id: caller.userId,
        subject_user_id: caller.userId,
        consent_type: "terms_and_privacy",
        policy_version: policyVersion,
        status: "active",
      });
      if (insertError) throw insertError;
    }

    return new Response(JSON.stringify({ recorded: true, policyVersion }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
