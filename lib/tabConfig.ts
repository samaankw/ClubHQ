import { OrgType, Role } from "@/types/db";
import { getVocab } from "@/lib/vocab";
import { IconName } from "@/components/ui";

export interface TabDef {
  // Matches the route's file name under app/(tabs)/, i.e. the Tabs.Screen
  // `name` prop -- not a display string.
  name: string;
  title: string;
  icon: IconName;
  focusedIcon: IconName;
  // Coach/director tool, reachable via router.push from Profile rather than
  // a permanent tab-bar slot -- see app/(tabs)/_layout.tsx's original
  // comment on why Copilot in particular stays out of the bar.
  hidden?: boolean;
  showUnreadBadge?: boolean;
}

// A parent browsing "Players" reads as a full roster they can page through;
// what they're actually looking at is their own linked child. Staff (coach,
// director) see the real roster/client-list title; a parent sees the
// singular "my own kid" framing instead, in whatever org_type's wording.
export function getTabConfig(role: Role | null | undefined, orgType: OrgType | null | undefined): TabDef[] {
  const vocab = getVocab(orgType);
  const rosterTitle = role === "parent" ? vocab.myMemberLabel : vocab.rosterTitle;

  return [
    { name: "dashboard", title: "Home", icon: "home-outline", focusedIcon: "home" },
    { name: "schedule", title: "Schedule", icon: "calendar-outline", focusedIcon: "calendar", showUnreadBadge: true },
    { name: "messages", title: "Messages", icon: "chatbubble-ellipses-outline", focusedIcon: "chatbubble-ellipses" },
    { name: "players", title: rosterTitle, icon: "people-outline", focusedIcon: "people" },
    { name: "copilot", title: "Copilot", icon: "sparkles-outline", focusedIcon: "sparkles", hidden: true },
    { name: "profile", title: "Profile", icon: "person-outline", focusedIcon: "person" },
  ];
}
