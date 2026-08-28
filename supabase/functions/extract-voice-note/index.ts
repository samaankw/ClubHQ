// Supabase Edge Function (Deno)
// Deploy with: supabase functions deploy extract-voice-note
// Requires secret: ANTHROPIC_API_KEY   (that's it — no OpenAI key, no audio upload)
//
// The transcript is produced on-device (iOS/Android built-in speech recognition via
// expo-speech-recognition), so this function never sees or stores raw audio. It only
// turns text into structured per-player updates, which is cheap enough to run on Haiku.
//
// Input JSON body: { transcript: string, team_id: string }
// The caller must be a coach/director whose club matches the requested team's club —
// verified server-side from their JWT, not trusted from the request — so a coach at
// one club can't pull another club's roster by guessing/changing a team_id.
// Privacy note: no real name — not even a first name or initial — reaches Claude.
// Every roster player is assigned a stable "Player_N" label, the transcript is
// scrubbed of real names before it's sent (same anonymization pattern as
// director-copilot), and labels are swapped back for real names in the
// response after Claude is done. Matching happens against the scrubbed
// transcript + labeled roster, not the original text.
// Output: { updates: [{ player_name, player_id | null, skill, direction, note }] }

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { authenticate, enforceRateLimit, errorResponse, AuthError } from "../_shared/auth.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const SKILL_KEYS = [
  "first_touch",
  "ball_control",
  "passing",
  "dribbling",
  "weak_foot",
  "finishing",
  "decision_making",
  "scanning",
  "speed",
  "positioning",
];

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  try {
    const caller = await authenticate(req);
    if (caller.role !== "coach" && caller.role !== "director") {
      throw new AuthError("Only coaches and directors can run voice evaluations.", 403);
    }
    // One call per voice note — a coach isn't recording dozens per hour.
    await enforceRateLimit(caller, "extract-voice-note", 10, 60);

    const { transcript, team_id } = await req.json();
    if (!transcript || !team_id) {
      return new Response(JSON.stringify({ error: "transcript and team_id are required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = caller.admin;

    const { data: team } = await supabase.from("teams").select("id, club_id").eq("id", team_id).single();
    if (!team || team.club_id !== caller.clubId) {
      throw new AuthError("That team isn't part of your club.", 403);
    }

    const { data: roster } = await supabase.from("players").select("id, full_name").eq("team_id", team_id);

    // Anonymization codebook — every roster player gets a stable "Player_N"
    // label. Sort by name length (longest first) so scrubbing a longer full
    // name doesn't get short-circuited by a shorter overlapping match.
    const codebook = new Map<string, string>(); // player id -> label
    const reverseCodebook = new Map<string, string>(); // label -> real full name
    (roster ?? []).forEach((p, idx) => {
      const label = `Player_${idx + 1}`;
      codebook.set(p.id, label);
      reverseCodebook.set(label, p.full_name);
    });

    const rosterList = (roster ?? [])
      .map((p) => `${codebook.get(p.id)} (id: ${p.id})`)
      .join(", ");

    // Best-effort scrub: replace every occurrence of any roster player's full
    // name, or any individual name part (first/last) two+ characters long,
    // with their label. Longest names first so "Jordan Smith" is caught
    // whole before "Jordan" alone would partially match it. This can't catch
    // nicknames or misheard/misspelled names from on-device transcription —
    // same caveat as the scrubbing used elsewhere in this app.
    const namesLongestFirst = [...(roster ?? [])].sort((a, b) => b.full_name.length - a.full_name.length);
    let safeTranscript = transcript as string;
    for (const p of namesLongestFirst) {
      const label = codebook.get(p.id)!;
      const fullPattern = new RegExp(`\\b${p.full_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      safeTranscript = safeTranscript.replace(fullPattern, label);
      for (const part of p.full_name.split(/\s+/)) {
        if (part.length < 2) continue;
        const partPattern = new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        safeTranscript = safeTranscript.replace(partPattern, label);
      }
    }

    const prompt = `A youth soccer coach just recorded a quick post-practice voice note about several players.
Turn it into structured updates. Players are referred to by anonymized labels (Player_1, Player_2, etc.) — always use these exact labels, never invent a name.

Team roster: ${rosterList || "(no roster on file)"}

Transcript:
"""
${safeTranscript}
"""

Valid skill keys: ${SKILL_KEYS.join(", ")}

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "updates": [
    {
      "player_name": "the anonymized label as it appears in the transcript, e.g. Player_1",
      "player_id": "matching id from the roster list above, or null if no confident match",
      "skill": "one of the valid skill keys, best match for what the coach described",
      "direction": "up" | "down" | "flat",
      "note": "short paraphrase of what the coach said about this player, in the coach's voice — use the label, not a name, if you refer to the player again"
    }
  ]
}
Only include players actually mentioned. If the coach's comment doesn't clearly map to one skill key, pick the closest one and say so briefly in the note. On-device speech recognition can misspell labels or drop small words — if a mention is too garbled to confidently match a label, set player_id to null rather than guessing.`;

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!aiResp.ok) throw new Error(`Anthropic API error: ${await aiResp.text()}`);
    const aiData = await aiResp.json();
    const rawText = aiData.content.map((c: { text?: string }) => c.text ?? "").join("");
    const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());

    // Swap labels back for real names now that Claude is done — the model
    // only ever saw "Player_1", "Player_2", etc., never a real name.
    const updates = (Array.isArray(parsed.updates) ? parsed.updates : []).map((u: { player_name?: string; note?: string; [k: string]: unknown }) => {
      let playerName = typeof u.player_name === "string" ? u.player_name : "";
      let note = typeof u.note === "string" ? u.note : "";
      for (const [label, realName] of reverseCodebook) {
        playerName = playerName.split(label).join(realName);
        note = note.split(label).join(realName);
      }
      return { ...u, player_name: playerName, note };
    });

    return new Response(JSON.stringify({ updates }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
