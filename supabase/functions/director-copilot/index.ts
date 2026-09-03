// Supabase Edge Function (Deno)
// Deploy with: supabase functions deploy director-copilot
// Requires secret: ANTHROPIC_API_KEY
//
// Input JSON body: { question: string }
// club_id is NOT taken from the request — it's read from the caller's own profile,
// verified via their JWT, so a director can never query another club's data by
// changing a value in the request body. Only coaches/directors may call this.
// Gathers aggregate data (skill averages, evaluation activity, homework completion,
// most/least improved players) and asks Claude to answer the caller's question grounded
// in that data. Returns { answer: string }.
//
// Scope depends on the caller's role, read from their verified profile:
//   director -> the whole club, including a by-name breakdown of which coaches
//               are completing evaluations. Overseeing staff is the part of a
//               director's job nobody else does.
//   coach    -> only the teams they are assigned in `team_coaches`, and no
//               by-name data about other staff. A coach's remit is the players
//               assigned to them; answering "which coaches are keeping up?" for
//               them would be handing out a leaderboard of their peers.
// This is a product boundary rather than a security one — `is_club_staff` in RLS
// already lets a coach read club-wide players and evaluations through the normal
// screens. What it controls is what the Copilot itself volunteers.

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
    const isDirector = caller.role === "director";
    const NO_MATCH = "00000000-0000-0000-0000-000000000000";

    // Archived teams and players are excluded here and in the dashboard card
    // (lib/hooks.ts, useCopilotSnapshot). Two surfaces quoting different player
    // counts for the same club reads as a broken app, and counting an archived
    // player as "never evaluated" is a warning nobody can ever clear.
    const { data: clubTeams } = await supabase
      .from("teams")
      .select("id, name, age_group")
      .eq("club_id", club_id)
      .is("archived_at", null);

    let teams = clubTeams ?? [];
    if (!isDirector) {
      const { data: assignments } = await supabase
        .from("team_coaches")
        .select("team_id")
        .eq("coach_id", caller.userId);
      const assigned = new Set((assignments ?? []).map((a) => a.team_id));
      // Intersecting with the club's own team list, rather than trusting
      // team_coaches alone, keeps a stale assignment to a team in another club
      // from widening this coach's scope.
      teams = teams.filter((t) => assigned.has(t.id));

      // Answer directly rather than sending an empty data set to Claude, which
      // would burn a call to be told there is nothing to report.
      if (teams.length === 0) {
        return new Response(
          JSON.stringify({
            answer:
              "You aren't assigned to a team yet, so there's no player data for me to read. Your director can add you to one.",
          }),
          { headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }
    const teamIds = teams.map((t) => t.id);

    const { data: players } = await supabase
      .from("players")
      .select("id, full_name, team_id")
      .in("team_id", teamIds.length ? teamIds : [NO_MATCH])
      .is("archived_at", null);
    const playerIds = (players ?? []).map((p) => p.id);

    // Names used ONLY to scrub the caller's typed question before it reaches
    // Anthropic. A coach's data is scoped to their own teams, but the question
    // they type could name any child in the club ("how is Jordan doing?") — so
    // the scrub list stays club-wide, or a name outside their scope would go
    // out in the clear. Scoping the data must not narrow the redaction.
    let scrubNames = (players ?? []).map((p) => p.full_name);
    if (!isDirector) {
      const clubTeamIds = (clubTeams ?? []).map((t) => t.id);
      const { data: allClubPlayers } = await supabase
        .from("players")
        .select("full_name")
        .in("team_id", clubTeamIds.length ? clubTeamIds : [NO_MATCH])
        .is("archived_at", null);
      scrubNames = (allClubPlayers ?? []).map((p) => p.full_name);
    }

    // Latest evaluation per player (approximated by pulling recent evaluations and keeping first per player)
    const { data: evaluations } = await supabase
      .from("evaluations")
      .select("*")
      .in("player_id", playerIds.length ? playerIds : [NO_MATCH])
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
      .in("player_id", playerIds.length ? playerIds : [NO_MATCH])
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

    // Evaluation activity over the last 30 days. A director gets it broken down
    // by coach name; a coach gets only their own count, from the same rows.
    const { data: recentEvaluations } = await supabase
      .from("evaluations")
      .select("player_id, coach_id, profiles(full_name)")
      .in("player_id", playerIds.length ? playerIds : [NO_MATCH])
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const coachCounts = new Map<string, number>();
    if (isDirector) {
      // Seeded with every coach in the club at zero BEFORE counting, because
      // evaluation rows only contain coaches who did the work. Without this the
      // dashboard card could say "3 coaches logged no evaluations" and then the
      // Copilot, asked to name them, would have no record they exist.
      const { data: clubCoaches } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("club_id", club_id)
        .eq("role", "coach");
      (clubCoaches ?? []).forEach((c) => coachCounts.set(c.full_name ?? "Unknown coach", 0));

      (recentEvaluations ?? []).forEach((e) => {
        const name = (e.profiles as unknown as { full_name: string } | null)?.full_name ?? "Unknown coach";
        coachCounts.set(name, (coachCounts.get(name) ?? 0) + 1);
      });
    }
    const myEvaluationCount = (recentEvaluations ?? []).filter((e) => e.coach_id === caller.userId).length;

    // The other half of what the dashboard card teases: which players are
    // actually behind, not just how many. Capped so a large club can't blow out
    // the prompt, with the true total alongside so the answer stays honest.
    const evaluatedRecently = new Set((recentEvaluations ?? []).map((e) => e.player_id));
    const notEvaluatedRecently = (players ?? [])
      .filter((p) => !evaluatedRecently.has(p.id))
      .map((p) => labelFor(p.full_name));

    // Homework completion rate
    const { data: homework } = await supabase
      .from("homework_items")
      .select("completed, player_id")
      .in("player_id", playerIds.length ? playerIds : [NO_MATCH]);
    const hwTotal = homework?.length ?? 0;
    const hwDone = (homework ?? []).filter((h) => h.completed).length;

    const dataContext = {
      scope: isDirector ? "every team in the club" : "only the teams this coach is assigned to",
      teams: teams.map((t) => ({ name: t.name, age_group: t.age_group })),
      total_players: players?.length ?? 0,
      skill_summary: skillSummary,
      most_improved_players: improvement.slice(0, 10),
      least_improved_players: improvement.slice(-5),
      homework_completion_rate_pct: hwTotal ? Math.round((hwDone / hwTotal) * 100) : null,
      players_with_no_evaluation_in_30_days: {
        count: notEvaluatedRecently.length,
        players: notEvaluatedRecently.slice(0, 25),
      },
      // A coach sees their own activity, never a ranking of their colleagues.
      ...(isDirector
        ? { evaluations_last_30_days_by_coach: Object.fromEntries(coachCounts) }
        : { your_evaluations_last_30_days: myEvaluationCount }),
    };

    // Scrub the caller's own typed question for any real player names before
    // it goes anywhere near the prompt — a director or coach very plausibly
    // types "How's Jordan doing?" rather than an abstract question.
    scrubNames.forEach((name) => labelFor(name)); // ensure every club player has a label, even ones outside the improvement list
    let safeQuestion = question as string;
    for (const [realName, label] of codebook) {
      const parts = realName.split(/\s+/).filter((p: string) => p.length > 1);
      for (const part of parts) {
        const pattern = new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        safeQuestion = safeQuestion.replace(pattern, label);
      }
    }

    const roleWord = isDirector ? "director" : "coach";
    const coachGuardrail = isDirector
      ? ""
      : `\nThis data covers only the teams this coach is assigned to, not the whole club, and contains nothing about how other coaches are performing. If they ask about the club as a whole or about other staff, say plainly that you can only see their own teams and suggest they ask their director.\n`;

    const prompt = `You are ClubHQ's ${isDirector ? "Director" : "Coach"} Copilot — an assistant for a youth soccer club ${roleWord}.
Answer the ${roleWord}'s question using ONLY the data below. Be specific and cite numbers where you have them.
If the data doesn't cover what's being asked, say so plainly rather than guessing.
Players are referred to by anonymized labels (Player_1, Player_2, etc.) — always use these exact labels in your answer, never invent a name.
${coachGuardrail}
Data (${dataContext.scope}):
${JSON.stringify(dataContext, null, 2)}

The ${roleWord}'s question: "${safeQuestion}"

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
      players_with_no_evaluation_in_30_days: {
        ...dataContext.players_with_no_evaluation_in_30_days,
        players: dataContext.players_with_no_evaluation_in_30_days.players.map(
          (label) => reverseCodebook.get(label) ?? label
        ),
      },
    };

    return new Response(JSON.stringify({ answer, data_context: deAnonymizedContext }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
