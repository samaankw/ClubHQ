import { useAuth } from "@/lib/AuthProvider";
import { OrgType } from "@/types/db";

export interface VocabSet {
  organization: { singular: string; plural: string };
  // A private trainer has no group/roster concept at all -- 1:1 or
  // small-group sessions with no standing team. null here, not a string,
  // so a call site has to actively decide what to render instead of
  // silently showing an empty-but-present label.
  group: { singular: string; plural: string } | null;
  member: { singular: string; plural: string };
  staff: { singular: string; plural: string };
  // A generic scheduled occurrence -- practice/game/tournament already vary
  // by EventType regardless of org_type, so this only covers the generic
  // "a thing on the schedule" case, not a replacement for EventType labels.
  session: { singular: string; plural: string };
  // The screen title for the roster/client-list tab and screen.
  rosterTitle: string;
  // A parent's view of their own linked child, e.g. "My Player" vs "My Client".
  myMemberLabel: string;
}

const VOCAB: Record<OrgType, VocabSet> = {
  private_trainer: {
    organization: { singular: "Practice", plural: "Practices" },
    group: null,
    member: { singular: "Client", plural: "Clients" },
    staff: { singular: "Coach", plural: "Coaches" },
    session: { singular: "Session", plural: "Sessions" },
    rosterTitle: "My Clients",
    myMemberLabel: "My Client",
  },
  academy: {
    organization: { singular: "Academy", plural: "Academies" },
    group: { singular: "Training Group", plural: "Training Groups" },
    member: { singular: "Athlete", plural: "Athletes" },
    staff: { singular: "Coach", plural: "Coaches" },
    session: { singular: "Session", plural: "Sessions" },
    rosterTitle: "Athletes",
    myMemberLabel: "My Athlete",
  },
  small_club: {
    organization: { singular: "Club", plural: "Clubs" },
    group: { singular: "Team", plural: "Teams" },
    member: { singular: "Player", plural: "Players" },
    staff: { singular: "Coach", plural: "Coaches" },
    session: { singular: "Session", plural: "Sessions" },
    rosterTitle: "Players",
    myMemberLabel: "My Player",
  },
  large_club: {
    organization: { singular: "Club", plural: "Clubs" },
    group: { singular: "Team", plural: "Teams" },
    member: { singular: "Player", plural: "Players" },
    staff: { singular: "Coach", plural: "Coaches" },
    session: { singular: "Session", plural: "Sessions" },
    rosterTitle: "Players",
    myMemberLabel: "My Player",
  },
};

// small_club's wording is also the fallback for a not-yet-loaded or missing
// org_type -- it matches every screen's existing hardcoded copy, so a
// profile mid-load never flashes different wording than what's about to
// replace it once org_type actually arrives.
export function getVocab(orgType: OrgType | null | undefined): VocabSet {
  return VOCAB[orgType ?? "small_club"];
}

export function useVocab(): VocabSet {
  const { orgType } = useAuth();
  return getVocab(orgType);
}
