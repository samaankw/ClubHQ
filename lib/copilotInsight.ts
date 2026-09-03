import type { CopilotRole } from "./copilotScope";

/**
 * The numbers the dashboard card reasons over. "In scope" means the whole club
 * for a director and only the coach's own teams for a coach, so the same
 * thresholds below read correctly for both without branching on totals.
 */
export interface CopilotSnapshot {
  role: CopilotRole;
  /** Players in scope. */
  playerCount: number;
  /** Distinct in-scope players with at least one evaluation in the last 30 days. */
  playersEvaluatedLast30Days: number;
  /** Directors only: coaches in the club, and how many logged nothing in 30 days. */
  coachCount: number;
  inactiveCoachCount: number;
  /** Homework items assigned to in-scope players, and how many are done. */
  homeworkTotal: number;
  homeworkCompleted: number;
}

export type InsightTone = "success" | "warning" | "neutral";

export interface CopilotInsight {
  headline: string;
  detail: string;
  tone: InsightTone;
  /** The Copilot question this insight is the teaser for — tapping the card
   *  asks it, so the user never faces an empty prompt box. */
  question: string;
}

/**
 * Below this, a completion percentage is arithmetic on a handful of rows
 * rather than a trend, and flagging it would cry wolf in a club's first week.
 */
const MIN_HOMEWORK_FOR_A_RATE = 5;
/** Under half done is the point where "assigned" and "happening" have parted ways. */
const LOW_HOMEWORK_PCT = 50;
/** More than a quarter of the roster uncovered is a gap, not normal churn. */
const UNCOVERED_SHARE_WORTH_WARNING = 0.25;

/** "coach" takes -es, so the count and the noun have to be pluralized
 *  together rather than by appending an "s" at each call site. */
const plural = (n: number, singular: string, pluralForm = `${singular}s`) =>
  n === 1 ? singular : pluralForm;

/**
 * Picks the single most useful thing to say on the Home screen.
 *
 * Home is opened between sessions, not sat with — so this returns ONE finding
 * rather than a digest, and always pairs it with the question that opens the
 * Copilot on that same topic. A blank chat box on a dashboard asks the user to
 * invent a question; this hands them an answer and a way to go deeper.
 *
 * Priority is deliberate: staff coverage first for a director (overseeing
 * coaches is the part of the job nobody else can do), then roster coverage,
 * then engagement, then the steady-state acknowledgement. The first two
 * overlap by construction — an inactive coach's players are also unevaluated —
 * and naming the coach is the more actionable half of that overlap, which is
 * why it wins rather than being reported alongside.
 *
 * Returns null with no players in scope: that is a setup problem, and the
 * dashboard's SetupChecklist already owns it.
 */
export function computeCopilotInsight(snapshot: CopilotSnapshot): CopilotInsight | null {
  const { role, playerCount, playersEvaluatedLast30Days, coachCount, inactiveCoachCount } = snapshot;
  const isDirector = role === "director";

  if (playerCount <= 0) return null;

  if (isDirector && coachCount > 0 && inactiveCoachCount > 0) {
    return {
      headline: `${inactiveCoachCount} ${plural(inactiveCoachCount, "coach", "coaches")} logged no evaluations in 30 days`,
      detail: `Out of ${coachCount} ${plural(coachCount, "coach", "coaches")} in the club. Evaluation activity is the earliest sign a coach has stopped engaging with the app.`,
      tone: "warning",
      question: "Which coaches are completing evaluations consistently?",
    };
  }

  // Clamped: a player evaluated by two coaches still counts once upstream, but
  // a bad count should degrade to "nothing to flag" rather than a negative.
  const uncovered = Math.max(0, playerCount - playersEvaluatedLast30Days);
  if (uncovered > 0) {
    return {
      headline: isDirector
        ? `${uncovered} ${plural(uncovered, "player")} not evaluated in 30 days`
        : `${uncovered} ${plural(uncovered, "player")} on your teams not evaluated in 30 days`,
      detail: isDirector
        ? `Out of ${playerCount} in the club. Families notice the gap before you do.`
        : `Out of ${playerCount} you coach. An evaluation is what their development plan is built from.`,
      tone: uncovered / playerCount > UNCOVERED_SHARE_WORTH_WARNING ? "warning" : "neutral",
      question: isDirector
        ? "Which players haven't been evaluated recently?"
        : "Which of my players haven't been evaluated recently?",
    };
  }

  const { homeworkTotal, homeworkCompleted } = snapshot;
  if (homeworkTotal >= MIN_HOMEWORK_FOR_A_RATE) {
    const pct = Math.round((homeworkCompleted / homeworkTotal) * 100);
    if (pct < LOW_HOMEWORK_PCT) {
      return {
        headline: `Homework completion is at ${pct}%`,
        detail: `${homeworkCompleted} of ${homeworkTotal} assigned ${plural(homeworkTotal, "item")} done. Everyone is evaluated — the drop-off is between the plan and the work.`,
        tone: "warning",
        question: isDirector
          ? "What's our homework completion rate?"
          : "How are my players doing on their homework?",
      };
    }
  }

  return {
    headline: isDirector
      ? `All ${playerCount} ${plural(playerCount, "player")} evaluated in the last 30 days`
      : `All ${playerCount} of your ${plural(playerCount, "player")} evaluated in the last 30 days`,
    detail: "Coverage is current. Ask about where players are actually improving.",
    tone: "success",
    question: isDirector
      ? "Which players improved the most this season?"
      : "Which of my players improved the most?",
  };
}
