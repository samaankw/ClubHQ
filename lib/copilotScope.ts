import type { IconName } from "@/components/ui";
import type { Role } from "@/types/db";

/**
 * The two roles the Copilot exists for. Parents and players never reach it —
 * `copilotRoleFor` is the single place that decision is made, so the screen,
 * the dashboard card and any future entry point can't drift apart on it.
 */
export type CopilotRole = "director" | "coach";

export function copilotRoleFor(role: Role | null | undefined): CopilotRole | null {
  return role === "director" || role === "coach" ? role : null;
}

export interface CopilotSuggestion {
  text: string;
  icon: IconName;
}

export interface CopilotIdentity {
  /** Product name as this role sees it. */
  title: string;
  /** One line stating what the answers are grounded in, so nobody has to
   *  guess whether "most common weakness" means their teams or the club. */
  scopeLine: string;
  /** Starter questions, phrased in the vocabulary of this role's job. */
  suggestions: CopilotSuggestion[];
  /**
   * Whether answers for this role may name other staff members. Directors
   * oversee coaches, so a by-name evaluation breakdown is the point; a coach
   * asking the same question would be reading a leaderboard of their peers,
   * which is a different product than the one being sold.
   *
   * This is a product boundary, not a security one — `is_club_staff` in RLS
   * already grants coaches club-wide read on players and evaluations, so a
   * coach can still see this data through the regular screens. What this
   * controls is what the Copilot volunteers.
   */
  canSeeStaffByName: boolean;
}

const DIRECTOR: CopilotIdentity = {
  title: "Director Copilot",
  scopeLine: "Grounded in live data from across your whole club.",
  suggestions: [
    { text: "Which coaches are completing evaluations consistently?", icon: "checkmark-done" },
    { text: "What's the most common weakness across the club?", icon: "warning-outline" },
    { text: "Which players improved the most this season?", icon: "trending-up" },
    { text: "What's our homework completion rate?", icon: "stats-chart" },
  ],
  canSeeStaffByName: true,
};

const COACH: CopilotIdentity = {
  title: "Coach Copilot",
  scopeLine: "Grounded in live data for the players on your teams.",
  suggestions: [
    { text: "Which of my players haven't been evaluated recently?", icon: "alert-circle-outline" },
    { text: "What's the most common weakness on my teams?", icon: "warning-outline" },
    { text: "Which of my players improved the most?", icon: "trending-up" },
    { text: "How are my players doing on their homework?", icon: "stats-chart" },
  ],
  canSeeStaffByName: false,
};

/**
 * A director's job is the organization; a coach's job is the players assigned
 * to them. One shared chat screen served both with director-shaped prompts,
 * which told a coach the tool wasn't built for them and invited them to ask
 * organization-level questions they have no remit to act on.
 */
export function copilotIdentity(role: CopilotRole): CopilotIdentity {
  return role === "director" ? DIRECTOR : COACH;
}
