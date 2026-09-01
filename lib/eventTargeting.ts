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
 * Extracted verbatim from create-event.tsx, which is its only caller. Getting
 * this wrong sends a private session to the whole club, so change the rule
 * only with the tests in front of you.
 *
 * Not shared with create-announcement.tsx, despite the surface similarity:
 * announcements use a different model (a `target_type` of everyone | team |
 * players | parents written to the row, plus a separate
 * announcement_player_targets insert) and have no partial-team concept at
 * all. Wiring this function into it would be wrong, not merely unnecessary.
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
