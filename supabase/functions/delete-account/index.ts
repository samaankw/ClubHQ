// Supabase Edge Function (Deno)
// Deploy with: supabase functions deploy delete-account
// Permanently deletes the authenticated adult user's Auth record. Profile rows
// cascade from auth.users. A director must transfer/delete any owned club first.

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

    if (caller.role === "director") {
      const { count, error: clubError } = await caller.admin
        .from("clubs")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", caller.userId);
      if (clubError) throw clubError;
      if ((count ?? 0) > 0) {
        throw new AuthError("Transfer or delete clubs you own before deleting your account.", 409);
      }
    }

    // Preserve club history while removing personally attributable adult references.
    // Tables with ON DELETE CASCADE/SET NULL are handled by Postgres; these older
    // foreign keys pre-date that behavior and are cleared explicitly.
    const nullableRefs: Array<[string, string]> = [
      ["announcements", "author_id"],
      ["events", "created_by"],
      ["messages", "sender_id"],
      ["evaluations", "coach_id"],
      ["drills", "added_by"],
      ["report_views", "viewer_id"],
    ];
    for (const [table, column] of nullableRefs) {
      const { error: clearError } = await caller.admin.from(table).update({ [column]: null }).eq(column, caller.userId);
      if (clearError) throw clearError;
    }

    const { error } = await caller.admin.auth.admin.deleteUser(caller.userId);
    if (error) throw error;

    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
