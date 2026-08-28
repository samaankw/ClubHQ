// Every team at this club shares the same name (the club's own name, entered
// as a default at team-creation time) — age_group is the field that
// actually distinguishes one training group from another, so prefer it
// wherever a team needs to be told apart from the others at a glance.
export function teamLabel(team: { name: string; age_group?: string | null }): string {
  return team.age_group?.trim() || team.name;
}
