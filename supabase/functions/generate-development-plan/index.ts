// Supabase Edge Function (Deno)
// Deploy with: supabase functions deploy generate-development-plan
// Requires secret: ANTHROPIC_API_KEY  (supabase secrets set ANTHROPIC_API_KEY=sk-...)
//
// Input JSON body: { evaluation_id: string }
// Only the coach who wrote the evaluation, or a director of the same club, can
// trigger plan generation for it — verified server-side from the caller's JWT
// against the evaluation and player's actual club, not trusted from the request.
// Reads the evaluation + prior evaluation (if any) from Postgres, asks Claude
// to identify priorities, writes a development_plans row + homework_items rows,
// and returns the created plan.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { authenticate, enforceRateLimit, errorResponse, AuthError } from "../_shared/auth.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const SKILLS = [
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
] as const;

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  try {
    const caller = await authenticate(req);
    if (caller.role !== "coach" && caller.role !== "director") {
      throw new AuthError("Only coaches and directors can generate development plans.", 403);
    }
    // 20 calls/hour is generous for even a big roster day of evaluations,
    // and cheap to be wrong about — it just means a retry a bit later.
    await enforceRateLimit(caller, "generate-development-plan", 20, 60);

    const { evaluation_id } = await req.json();
    if (!evaluation_id) {
      return new Response(JSON.stringify({ error: "evaluation_id is required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = caller.admin;

    const { data: evaluation, error: evalErr } = await supabase
      .from("evaluations")
      .select("*")
      .eq("id", evaluation_id)
      .single();
    if (evalErr || !evaluation) throw evalErr ?? new Error("Evaluation not found");

    // Confirm the evaluation belongs to the caller's own club (via the player's team),
    // and that the caller either wrote it themselves or is a director of that club.
    const { data: player } = await supabase
      .from("players")
      .select("id, full_name, team_id, teams(club_id)")
      .eq("id", evaluation.player_id)
      .single();
    const clubId = (player?.teams as unknown as { club_id: string } | null)?.club_id ?? null;

    if (clubId !== caller.clubId) {
      throw new AuthError("That evaluation isn't part of your club.", 403);
    }
    if (evaluation.coach_id !== caller.userId && caller.role !== "director") {
      throw new AuthError("You can only generate plans for evaluations you wrote.", 403);
    }

    // Prior evaluation, for trend context
    const { data: priorEvals } = await supabase
      .from("evaluations")
      .select("*")
      .eq("player_id", evaluation.player_id)
      .neq("id", evaluation.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const priorEval = priorEvals?.[0] ?? null;

    const scores = Object.fromEntries(SKILLS.map((s) => [s, evaluation[s]]));

    // Scrub the player's real name out of free-text coach notes before it ever
    // reaches Claude — a coach very plausibly typed the name directly into their
    // notes even though the structured "Player:" field above is anonymized.
    // This is a best-effort text replace, not a guarantee: nicknames, misspellings,
    // or a note that says "he" instead of a name obviously won't be caught.
    const scrubName = (text: string, fullName: string): string => {
      const parts = fullName.split(/\s+/).filter(Boolean);
      let scrubbed = text;
      for (const part of parts) {
        if (part.length < 2) continue; // skip single-letter middle initials etc.
        const pattern = new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        scrubbed = scrubbed.replace(pattern, "{{PLAYER_NAME}}");
      }
      return scrubbed;
    };
    const safeCoachNotes = evaluation.coach_notes
      ? scrubName(evaluation.coach_notes, player?.full_name ?? "")
      : null;    const overallBefore = priorEval
      ? Math.round(SKILLS.reduce((sum, s) => sum + (priorEval[s] ?? 0), 0) / SKILLS.length * 10)
      : null;
    const overallAfter = Math.round(SKILLS.reduce((sum, s) => sum + (scores[s] ?? 0), 0) / SKILLS.length * 10);

    const prompt = `You are ClubHQ's youth soccer development AI. A coach just evaluated a player.

Player: {{PLAYER_NAME}}
Current scores (1-10): ${JSON.stringify(scores)}
Coach notes: ${safeCoachNotes ?? "(none)"}
Prior evaluation scores: ${priorEval ? JSON.stringify(Object.fromEntries(SKILLS.map((s) => [s, priorEval[s]]))) : "(none - first evaluation)"}

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "priorities": [ { "skill": "weak_foot", "note": "one short coaching-style reason this matters right now" } ],
  "summary": "2-3 sentence parent-facing summary in plain, encouraging language, mentioning any improvement since last time if applicable"
}
Include exactly 2-3 priorities, ordered by importance (lowest scores and/or notable coach-notes concerns first).
Use the literal placeholder {{PLAYER_NAME}} anywhere you would naturally use the player's name in the summary — do not invent or guess a name.`;

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error(`Anthropic API error: ${errText}`);
    }

    const aiData = await aiResp.json();
    const rawText = aiData.content.map((c: { text?: string }) => c.text ?? "").join("");
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Substitute the real name back in now that Claude is done — the model
    // never saw it, only the {{PLAYER_NAME}} placeholder.
    const realName = player?.full_name ?? "the player";
    if (typeof parsed.summary === "string") {
      parsed.summary = parsed.summary.split("{{PLAYER_NAME}}").join(realName);
    }
    if (Array.isArray(parsed.priorities)) {
      parsed.priorities = parsed.priorities.map((p: { note?: string; [k: string]: unknown }) => ({
        ...p,
        note: typeof p.note === "string" ? p.note.split("{{PLAYER_NAME}}").join(realName) : p.note,
      }));
    }

    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);

    const { data: plan, error: planErr } = await supabase
      .from("development_plans")
      .insert({
        player_id: evaluation.player_id,
        evaluation_id: evaluation.id,
        priorities: parsed.priorities,
        summary: parsed.summary,
        overall_score_before: overallBefore,
        overall_score_after: overallAfter,
        week_start: weekStart.toISOString().slice(0, 10),
      })
      .select()
      .single();
    if (planErr) throw planErr;

    // ---- Homework: pulled from the vetted drills library, never invented ----
    const DAYS = ["Mon", "Wed", "Fri"];
    const prioritySkills: string[] = (parsed.priorities ?? []).map((p: { skill: string }) => p.skill);

    const { data: candidateDrills } = await supabase
      .from("drills")
      .select("*")
      .in("skill", prioritySkills.length ? prioritySkills : ["first_touch"])
      .or(clubId ? `club_id.is.null,club_id.eq.${clubId}` : "club_id.is.null");

    const homeworkRows: Record<string, unknown>[] = [];
    prioritySkills.slice(0, 3).forEach((skill, idx) => {
      // Prefer a club-specific drill over the shared library if both exist
      const matches = (candidateDrills ?? []).filter((d) => d.skill === skill);
      const chosen = matches.find((d) => d.club_id === clubId) ?? matches[0];

      if (chosen) {
        homeworkRows.push({
          development_plan_id: plan.id,
          player_id: evaluation.player_id,
          day_of_week: DAYS[idx] ?? DAYS[idx % DAYS.length],
          title: chosen.title,
          description: chosen.video_url ? `${chosen.description}\n\nVideo: ${chosen.video_url}` : chosen.description,
          drill_id: chosen.id,
        });
      } else {
        // No vetted drill on file yet for this skill — fall back to a text-only assignment
        // rather than fabricating a video link.
        homeworkRows.push({
          development_plan_id: plan.id,
          player_id: evaluation.player_id,
          day_of_week: DAYS[idx] ?? DAYS[idx % DAYS.length],
          title: `${skill.replace(/_/g, " ")} practice`,
          description: `No drill video on file yet for this skill — ask your coach for a quick demo, or check the club's drill library.`,
          drill_id: null,
        });
      }
    });

    if (homeworkRows.length > 0) {
      const { error: hwErr } = await supabase.from("homework_items").insert(homeworkRows);
      if (hwErr) throw hwErr;
    }

    return new Response(JSON.stringify({ plan, homework: homeworkRows }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
