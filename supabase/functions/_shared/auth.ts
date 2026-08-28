// Shared by all ClubHQ edge functions. Import with:
//   import { authenticate } from "../_shared/auth.ts";
//
// Every edge function here uses the Supabase SERVICE ROLE key so it can read/write
// across the whole database — which also means it bypasses Row Level Security.
// That's necessary (these functions do club-wide aggregation, cross-table writes,
// etc.) but it means EACH function is responsible for checking, in code, that the
// caller is actually allowed to see/touch what they're asking for. This helper
// does the one universal part of that: proving who the caller really is, straight
// from their JWT rather than trusting anything in the request body.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "./cors.ts";

export interface AuthedCaller {
  userId: string;
  role: "director" | "coach" | "parent" | "player";
  clubId: string | null;
  admin: SupabaseClient;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function authenticate(req: Request): Promise<AuthedCaller> {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new AuthError("Missing Authorization header.");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verifies the JWT against Supabase Auth — this is the actual identity check.
  // Nothing from the request body is trusted for who the caller is.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) throw new AuthError("Invalid or expired session.");

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role, club_id")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || !profile) throw new AuthError("No profile found for this account.");

  return {
    userId: userData.user.id,
    role: profile.role,
    clubId: profile.club_id,
    admin,
  };
}

// Call right after authenticate(). Throws a 429 AuthError if the caller has
// exceeded maxCalls within windowMinutes — checked BEFORE any Anthropic call
// is made, so a blocked request costs nothing.
export async function enforceRateLimit(
  caller: AuthedCaller,
  functionName: string,
  maxCalls: number,
  windowMinutes: number
): Promise<void> {
  const { data: allowed, error } = await caller.admin.rpc("check_rate_limit", {
    p_user_id: caller.userId,
    p_function_name: functionName,
    p_max_calls: maxCalls,
    p_window_minutes: windowMinutes,
  });
  if (error) throw new AuthError("Rate limit check failed.", 500);
  if (!allowed) {
    throw new AuthError(
      `Too many requests — you can call this again in a few minutes (limit: ${maxCalls} per ${windowMinutes} min).`,
      429
    );
  }
}

// Standard error handler for the catch block in every function. AuthError
// messages are written to be shown to the user, so they pass through as-is.
// Anything else (a raw Postgres error, a JSON parse failure, an Anthropic
// API error) gets logged server-side for debugging but returns a generic
// message to the client — the raw error text can contain internal details
// (table/column names, constraint names) that shouldn't reach the app.
export function errorResponse(err: unknown): Response {
  const headers = { ...corsHeaders, "content-type": "application/json" };
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers });
  }
  console.error(err);
  return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), { status: 500, headers });
}
