import type { Role } from "@/types/db";

// "Staff" means whichever roles get an operational tool a parent or player
// never should -- Director Copilot, the drill library, and anything else
// scoped the same way. It isn't specific to any one feature: four call sites
// (the dashboard, profile, the copilot screen, and manage-drills) each
// hand-rolled this identical check independently before this helper existed.
export function isClubStaff(role: Role | null | undefined): boolean {
  return role === "coach" || role === "director";
}

export function isDirector(role: Role | null | undefined): boolean {
  return role === "director";
}
