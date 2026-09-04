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

    // Confirm the evaluation belongs to the caller's own club, and that the
    // caller either wrote it themselves or is a director of that club.
    // players.club_id is authoritative (Phase 6a) -- read it directly rather
    // than joining through teams, which returns null (and denies) for a
    // teamless player.
    const { data: player } = await supabase
      .from("players")
      .select("id, full_name, club_id")
      .eq("id", evaluation.player_id)
      .single();
    const clubId = player?.club_id ?? null;

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

    // Scrub every roster player's name out of free-text coach notes before it
    // ever reaches Claude — a coach very plausibly typed a name directly into
    // notes even though the structured "Player:" field above is anonymized,
    // and may mention a teammate too ("beat Jordan to it"), not just the
    // player being evaluated. The evaluated player becomes the reversible
    // {{PLAYER_NAME}} placeholder (substituted back below); every other
    // roster player becomes a generic, non-reversible token, since the
    // response never needs to name them. This is a best-effort text replace,
    // not a guarantee: nicknames, misspellings, or a note that says "he"
    // instead of a name obviously won't be caught.
    const { data: roster } = await supabase.from("players").select("id, full_name").eq("club_id", clubId ?? "");
    const namesLongestFirst = [...(roster ?? [])].sort((a, b) => b.full_name.length - a.full_name.length);
    const scrubNotes = (text: string): string => {
      let scrubbed = text;
      for (const p of namesLongestFirst) {
        const token = p.id === evaluation.player_id ? "{{PLAYER_NAME}}" : "{{TEAMMATE}}";
        const nameParts = [p.full_name, ...p.full_name.split(/\s+/)].filter((part) => part.length >= 2);
        for (const part of nameParts) {
          const pattern = new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
          scrubbed = scrubbed.replace(pattern, token);
        }
      }
      return scrubbed.replace(/\S+@\S+\.\S+/g, "[EMAIL]");
    };
    const safeCoachNotes = evaluation.coach_notes ? scrubNotes(evaluation.coach_notes) : null;

    const overallBefore = priorEval
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

    // Validate the model's response shape before any of it reaches the
    // database — a parent-facing report shouldn't be able to carry a
    // fabricated skill key or a missing summary just because the model
    // returned syntactically valid JSON in an unexpected shape.
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) {
      throw new Error("Model response missing a valid summary.");
    }
    if (!Array.isArray(parsed.priorities) || parsed.priorities.length === 0) {
      throw new Error("Model response missing valid priorities.");
    }
    const validSkills: readonly string[] = SKILLS;
    for (const p of parsed.priorities) {
      if (!p || typeof p !== "object" || typeof p.note !== "string" || typeof p.skill !== "string" || !validSkills.includes(p.skill)) {
        throw new Error(`Model response contains an invalid priority: ${JSON.stringify(p)}`);
      }
    }

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

    // Audit trail: club/user/model/timestamp for every AI call, plus a
    // non-identifying summary of what came back (skill keys only — never
    // the parent-facing summary text or coach notes).
    await supabase.from("ai_call_log").insert({
      club_id: clubId,
      user_id: caller.userId,
      function_name: "generate-development-plan",
      model: "claude-sonnet-5",
      output_summary: JSON.stringify({ priority_skills: prioritySkills }),
    });

    return new Response(JSON.stringify({ plan, homework: homeworkRows }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
