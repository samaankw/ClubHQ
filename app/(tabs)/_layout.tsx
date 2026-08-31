import React, { useEffect } from "react";
import { Tabs, Redirect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/lib/AuthProvider";
import { registerPushToken } from "@/lib/notifications";
import { useUnreadAnnouncementsCount } from "@/lib/hooks";
import { OrgConfig } from "@/lib/orgConfig";

type TabName = "dashboard" | "schedule" | "messages" | "players" | "copilot" | "profile";

// Every Tabs.Screen's href goes through this instead of an ad-hoc literal,
// so a future club-only tab (standings, lineups -- Phase 3) has one place to
// add a case rather than a new bespoke hardcoded href on its own screen.
// Nothing in today's tab set actually varies by org type yet: teams/games
// aren't tabs, they're fields inside existing screens, so every case below
// besides copilot's (unconditional, unrelated to org type) returns
// `undefined` for now.
function tabHref(tab: TabName, _orgConfig: OrgConfig): undefined | null {
  if (tab === "copilot") {
    // Always reachable via router.push from Profile, never a tab-bar icon,
    // for any role or org type.
    return null;
  }
  return undefined;
}

export default function TabsLayout() {
  const { profile, orgConfig } = useAuth();
  const unreadAnnouncements = useUnreadAnnouncementsCount();

  useEffect(() => {
    if (profile?.id) void registerPushToken(profile.id);
  }, [profile?.id]);

  // Every screen under (tabs) assumes a club_id — send anyone without one to
  // set up or join a club first, same pattern as the (auth) group redirect.
  if (profile && !profile.club_id) return <Redirect href="/create-club" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0A6CFF",
        tabBarInactiveTintColor: "#6B6F76",
        tabBarLabelPosition: "below-icon",

        tabBarStyle: {
          backgroundColor: "#0B0B0D",
          borderTopWidth: 1,
          borderTopColor: "#242424",
          height: 112,
          paddingTop: 14,
          paddingBottom: 14,
        },

        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: "600",
          marginTop: 5,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          href: tabHref("dashboard", orgConfig),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={34}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          href: tabHref("schedule", orgConfig),
          tabBarBadge: unreadAnnouncements > 0 ? unreadAnnouncements : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              size={32}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
  name="messages"
  options={{
    title: "Messages",
    href: tabHref("messages", orgConfig),
    tabBarIcon: ({ color, focused }) => (
      <Ionicons
        name={
          focused
            ? "chatbubble-ellipses"
            : "chatbubble-ellipses-outline"
        }
        size={32}
        color={color}
      />
    ),
  }}
/>

      <Tabs.Screen
        name="players"
        options={{
          title: "Players",
          href: tabHref("players", orgConfig),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={34}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="copilot"
        options={{
          title: "Copilot",
          href: tabHref("copilot", orgConfig),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          href: tabHref("profile", orgConfig),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={32}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}


