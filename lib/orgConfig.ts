import AsyncStorage from "@react-native-async-storage/async-storage";

// The four org types a club row can be. Adding a fifth here without adding
// it to ORG_CONFIGS below is a compile error (see the Record type on
// ORG_CONFIGS), not a silent fallback to a default -- that's deliberate.
export type OrgType = "private_trainer" | "academy" | "small_club" | "large_club";

export interface OrgConfig {
  orgType: OrgType;
  labels: {
    grouping: string;
    groupingPlural: string;
    session: string;
    staff: string;
    staffPlural: string;
    admin: string;
  };
  features: {
    teams: boolean;
    games: boolean;
    standings: boolean;
    lineups: boolean;
    referees: boolean;
  };
  // Event-type chip default in create-event.tsx (Phase D) -- must not be
  // "practice" for an org with no practices.
  defaultEventType: string;
}

export const DEFAULT_ORG_TYPE: OrgType = "small_club";

const CLUB_FEATURES = { teams: true, games: true, standings: true, lineups: true, referees: true };
const NON_CLUB_FEATURES = { teams: false, games: false, standings: false, lineups: false, referees: false };

export const ORG_CONFIGS: Record<OrgType, OrgConfig> = {
  private_trainer: {
    orgType: "private_trainer",
    labels: {
      grouping: "Training Group",
      groupingPlural: "Training Groups",
      session: "Session",
      staff: "Trainer",
      staffPlural: "Trainers",
      admin: "Owner",
    },
    features: NON_CLUB_FEATURES,
    defaultEventType: "private_session",
  },
  academy: {
    orgType: "academy",
    labels: {
      grouping: "Group",
      groupingPlural: "Groups",
      session: "Session",
      staff: "Coach",
      staffPlural: "Coaches",
      admin: "Director",
    },
    features: NON_CLUB_FEATURES,
    defaultEventType: "clinic",
  },
  small_club: {
    orgType: "small_club",
    labels: {
      grouping: "Team",
      groupingPlural: "Teams",
      session: "Practice",
      staff: "Coach",
      staffPlural: "Coaches",
      admin: "Director",
    },
    features: CLUB_FEATURES,
    defaultEventType: "practice",
  },
  large_club: {
    orgType: "large_club",
    labels: {
      grouping: "Team",
      groupingPlural: "Teams",
      session: "Practice",
      staff: "Coach",
      staffPlural: "Coaches",
      admin: "Director",
    },
    features: CLUB_FEATURES,
    defaultEventType: "practice",
  },
};

export function resolveOrgConfig(orgType: string | null | undefined): OrgConfig {
  if (orgType && Object.prototype.hasOwnProperty.call(ORG_CONFIGS, orgType)) {
    return ORG_CONFIGS[orgType as OrgType];
  }
  return ORG_CONFIGS[DEFAULT_ORG_TYPE];
}

// Folded in from the deleted lib/teamLabel.ts, same behavior: every team at
// a club historically shared the same name (the club's own name, entered as
// a default at team-creation time) -- age_group is what actually
// distinguishes one training group from another, so prefer it wherever a
// team needs to be told apart from the others at a glance.
export function groupLabel(team: { name: string; age_group?: string | null }): string {
  return team.age_group?.trim() || team.name;
}

const CACHE_KEY_PREFIX = "clubhq_org_type_";

// Org config isn't secret -- it doesn't need expo-secure-store's Keychain
// backing (already used for the session token). AsyncStorage is the right
// tool here: fast, unencrypted, exactly what a coach on a field with no
// signal needs for the app to resolve labels/features on cold start.
export async function cacheOrgType(userId: string, orgType: OrgType): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, orgType);
  } catch (error) {
    console.warn("Couldn't cache org type:", error instanceof Error ? error.message : error);
  }
}

export async function getCachedOrgType(userId: string): Promise<OrgType | null> {
  try {
    const value = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
    return value && Object.prototype.hasOwnProperty.call(ORG_CONFIGS, value) ? (value as OrgType) : null;
  } catch {
    return null;
  }
}
