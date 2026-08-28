// Shared by all ClubHQ edge functions. Import with:
//   import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
//
// Native app calls aren't subject to CORS at all (it's a browser-only
// restriction), which is exactly why this went unnoticed for so long — every
// function here worked fine from the native app and quietly failed with a
// content-free "Failed to fetch" the moment the same call came from the web
// build, since the browser blocks the response (or the preflight OPTIONS
// request) before any of this code's own logic even runs.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Call this first, before any other logic. Browsers send an OPTIONS
// preflight ahead of any POST that carries an Authorization/Content-Type
// header — without an explicit response to it, the browser never even
// attempts the real request.
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}
