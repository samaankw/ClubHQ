export type AudienceMode = "club" | "team" | "player";

export interface TargetingInput {
  audienceMode: AudienceMode;
  /** The training group selected, when `audienceMode === "team"`. */
  teamId: string | null;
  /** Chosen on the "Select Players" audience mode. */
  selectedPlayerIds: string[];
  /** Who from `teamRoster` is actually attending, on the "team" audience mode. */
  attendingIds: string[];
  /** The full roster of the selected training group. Only its length matters. */
  teamRoster: unknown[];
}

export interface TargetingResult {
  teamId: string | null;
  playerIds: string[] | null;
}

/**
 * Decides who an event or announcement reaches: a training group as a whole
 * (`teamId` set, `playerIds` null), specific players regardless of team
 * (`playerIds` set, `teamId` null), the whole club (both null), or a subset
 * of a team's roster because someone's out that day (`teamId` and
 * `playerIds` both set — a partial team is still tied to the team for
 * display, but the player list is what actually gets targeted).
 *
 * Mirrors the targeting resolution in create-event.tsx exactly. Getting this
 * wrong sends a private session to the whole club, or an announcement to the
 * wrong parents — do not alter the rule, just call it from both call sites.
 */
export function resolveTargeting({
  audienceMode,
  teamId,
  selectedPlayerIds,
  attendingIds,
  teamRoster,
}: TargetingInput): TargetingResult {
  // Only attach an explicit player list when it's a *subset* of the group
  // (someone's out that day) or a private session — a full group roster is
  // represented by team_id alone, same as before.
  const isPartialTeam = audienceMode === "team" && attendingIds.length < teamRoster.length;
  const playerIds = audienceMode === "player" ? selectedPlayerIds : isPartialTeam ? attendingIds : null;

  return {
    teamId: audienceMode === "team" ? teamId : null,
    playerIds,
  };
}
