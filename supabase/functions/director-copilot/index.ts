// Supabase Edge Function (Deno)
// Deploy with: supabase functions deploy director-copilot
// Requires secret: ANTHROPIC_API_KEY
//
// Input JSON body: { question: string }
// club_id is NOT taken from the request — it's read from the caller's own profile,
// verified via their JWT, so a director can never query another club's data by
// changing a value in the request body. Only coaches/directors may call this.
// Gathers aggregate club data (skill averages, evaluation activity, homework completion,
// most/least improved players) and asks Claude to answer the director's question grounded
// in that data. Returns { answer: string }.

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
    if (caller.role !== "director" && caller.role !== "coach") {
      throw new AuthError("Only coaches and directors can use the Copilot.", 403);
    }
    if (!caller.clubId) {
      throw new AuthError("Your account isn't linked to a club yet.", 403);
    }
    // A chat session might reasonably hit 15-20 questions; two limits catch
    // both "burst spam" and "sustained hammering" without punishing normal use.
    await enforceRateLimit(caller, "director-copilot-burst", 6, 1);
    await enforceRateLimit(caller, "director-copilot-hourly", 30, 60);

    const { question } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: "question is required" }), { status: 400, headers: corsHeaders });
    }

    const club_id = caller.clubId; // from the verified profile, never from the request body
    const supabase = caller.admin;

    // All teams/players in this club
    const { data: teams } = await supabase.from("teams").select("id, name, age_group").eq("club_id", club_id);
    const teamIds = (teams ?? []).map((t) => t.id);

    const { data: players } = await supabase
      .from("players")
      .select("id, full_name, team_id")
      .in("team_id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);
    const playerIds = (players ?? []).map((p) => p.id);

    // Latest evaluation per player (approximated by pulling recent evaluations and keeping first per player)
    const { data: evaluations } = await supabase
      .from("evaluations")
      .select("*")
      .in("player_id", playerIds.length ? playerIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false })
      .limit(500);

    const latestByPlayer = new Map<string, Record<string, unknown>>();
    (evaluations ?? []).forEach((e) => {
      if (!latestByPlayer.has(e.player_id)) latestByPlayer.set(e.player_id, e);
    });

    // Club-wide skill averages + weakness counts (players scoring <=5 on a skill)
    const skillTotals: Record<string, { sum: number; count: number; weak: number }> = {};
    SKILL_KEYS.forEach((k) => (skillTotals[k] = { sum: 0, count: 0, weak: 0 }));
    latestByPlayer.forEach((evalRow) => {
      SKILL_KEYS.forEach((k) => {
        const v = evalRow[k] as number | null;
        if (v != null) {
          skillTotals[k].sum += v;
          skillTotals[k].count += 1;
          if (v <= 5) skillTotals[k].weak += 1;
        }
      });
    });
    const skillSummary = SKILL_KEYS.map((k) => {
      const t = skillTotals[k];
      return {
        skill: k,
        avg: t.count ? Math.round((t.sum / t.count) * 10) / 10 : null,
        pct_needing_improvement: t.count ? Math.round((t.weak / t.count) * 100) : null,
        evaluated_players: t.count,
      };
    });

    // Development plans: overall score before/after, to find most-improved players
    const { data: plans } = await supabase
      .from("development_plans")
      .select("player_id, overall_score_before, overall_score_after, created_at")
      .in("player_id", playerIds.length ? playerIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false })
      .limit(300);

    const nameById = new Map((players ?? []).map((p) => [p.id, p.full_name]));

    // Build an anonymization codebook: every real player name gets a stable
    // "Player_N" label. Names go into the prompt as labels, never as real
    // names — Claude never sees who anyone actually is. Labels get swapped
    // back for the real names in the final answer before it's returned.
    const codebook = new Map<string, string>(); // real name -> label
    const reverseCodebook = new Map<string, string>(); // label -> real name
    let labelCounter = 1;
    const labelFor = (name: string): string => {
      if (!codebook.has(name)) {
        const label = `Player_${labelCounter++}`;
        codebook.set(name, label);
        reverseCodebook.set(label, name);
      }
      return codebook.get(name)!;
    };

    const improvement = (plans ?? [])
      .filter((p) => p.overall_score_before != null)
      .map((p) => ({
        player: labelFor(nameById.get(p.player_id) ?? "Unknown"),
        delta: (p.overall_score_after ?? 0) - (p.overall_score_before ?? 0),
      }))
      .sort((a, b) => b.delta - a.delta);

    // Evaluation activity per coach (who's completing evaluations consistently)
    const { data: coachActivity } = await supabase
      .from("evaluations")
      .select("coach_id, profiles(full_name)")
      .in("player_id", playerIds.length ? playerIds : ["00000000-0000-0000-0000-000000000000"])
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    const coachCounts = new Map<string, number>();
    (coachActivity ?? []).forEach((e) => {
      const name = (e.profiles as unknown as { full_name: string } | null)?.full_name ?? "Unknown coach";
      coachCounts.set(name, (coachCounts.get(name) ?? 0) + 1);
    });

    // Homework completion rate
    const { data: homework } = await supabase
      .from("homework_items")
      .select("completed, player_id")
      .in("player_id", playerIds.length ? playerIds : ["00000000-0000-0000-0000-000000000000"]);
    const hwTotal = homework?.length ?? 0;
    const hwDone = (homework ?? []).filter((h) => h.completed).length;

    const dataContext = {
      teams: (teams ?? []).map((t) => ({ name: t.name, age_group: t.age_group })),
      total_players: players?.length ?? 0,
      skill_summary: skillSummary,
      most_improved_players: improvement.slice(0, 10),
      least_improved_players: improvement.slice(-5),
      evaluations_last_30_days_by_coach: Object.fromEntries(coachCounts),
      homework_completion_rate_pct: hwTotal ? Math.round((hwDone / hwTotal) * 100) : null,
    };

    // Scrub the director's own typed question for any real player names
    // before it goes anywhere near the prompt — a director very plausibly
    // types "How's Jordan doing?" rather than an abstract question.
    (players ?? []).forEach((p) => labelFor(p.full_name)); // ensure every player has a label, even ones not in the improvement list
    let safeQuestion = question as string;
    for (const [realName, label] of codebook) {
      const parts = realName.split(/\s+/).filter((p: string) => p.length > 1);
      for (const part of parts) {
        const pattern = new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        safeQuestion = safeQuestion.replace(pattern, label);
      }
    }

    const prompt = `You are ClubHQ's Director Copilot — an assistant for a youth soccer club director.
Answer the director's question using ONLY the data below. Be specific and cite numbers where you have them.
If the data doesn't cover what's being asked, say so plainly rather than guessing.
Players are referred to by anonymized labels (Player_1, Player_2, etc.) — always use these exact labels in your answer, never invent a name.

Club data:
${JSON.stringify(dataContext, null, 2)}

Director's question: "${safeQuestion}"

Answer in 2-5 sentences, conversational but data-grounded. If it would help, suggest one concrete next action.`;

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!aiResp.ok) throw new Error(`Anthropic API error: ${await aiResp.text()}`);
    const aiData = await aiResp.json();
    let answer = aiData.content.map((c: { text?: string }) => c.text ?? "").join("");

    // Swap the anonymized labels back for real names now that Claude is done —
    // the model only ever saw "Player_1", "Player_2", etc.
    for (const [label, realName] of reverseCodebook) {
      answer = answer.split(label).join(realName);
    }

    // data_context isn't currently shown in the UI, but de-anonymize it too so
    // it's never accidentally surfaced with labels instead of real names later.
    const deAnonymizedContext = {
      ...dataContext,
      most_improved_players: dataContext.most_improved_players.map((p) => ({
        ...p,
        player: reverseCodebook.get(p.player) ?? p.player,
      })),
      least_improved_players: dataContext.least_improved_players.map((p) => ({
        ...p,
        player: reverseCodebook.get(p.player) ?? p.player,
      })),
    };

    return new Response(JSON.stringify({ answer, data_context: deAnonymizedContext }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
