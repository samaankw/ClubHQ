import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { Tabs, Redirect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/AuthProvider";
import { registerPushToken } from "@/lib/notifications";
import { useUnreadAnnouncementsCount } from "@/lib/hooks";
import { color, space, type } from "@/theme";

export default function TabsLayout() {
  const { profile } = useAuth();
  const unreadAnnouncements = useUnreadAnnouncementsCount();
  const insets = useSafeAreaInsets();

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
        tabBarActiveTintColor: color.text.brand,
        tabBarInactiveTintColor: color.text.tertiary,
        tabBarStyle: {
          backgroundColor: color.bg.surface,
          borderTopColor: color.border.subtle,
          borderTopWidth: StyleSheet.hairlineWidth,
          // Base height for icon + label + vertical padding, plus the
          // device's own bottom safe-area inset (home-indicator strip) so
          // labels never sit inside that strip. A fixed height here would
          // override react-navigation's own inset-aware sizing.
          // Vertical budget, measured rather than guessed: a 24px icon, the
          // ~4px gap react-navigation puts between icon and label, and a 14px
          // label line = 42px of content. The previous 64px height with 8/12
          // padding left only 44px, which clipped labels at normal font scale.
          //
          // 72 base with 8/8 padding leaves 56px of content — 14px of slack,
          // enough to survive ~1.5x OS text scaling. The bottom safe-area inset
          // is added on top so labels never sit in the home-indicator strip.
          height: space[8] + space[7] + insets.bottom,
          paddingTop: space[2],
          paddingBottom: space[2] + insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: type.caption.fontSize,
          fontWeight: type.label.fontWeight,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarBadge: unreadAnnouncements > 0 ? unreadAnnouncements : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
  name="messages"
  options={{
    title: "Messages",
    tabBarIcon: ({ color, focused }) => (
      <Ionicons
        name={
          focused
            ? "chatbubble-ellipses"
            : "chatbubble-ellipses-outline"
        }
        size={24}
        color={color}
      />
    ),
  }}
/>

      <Tabs.Screen
        name="players"
        options={{
          title: "Players",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/* Copilot is a coach/director tool, not a daily screen for every
          role, so it doesn't take a permanent slot in an already-crowded tab
          bar. It's reached from the Copilot card on Home (see
          components/CopilotCard.tsx) — which also passes it a question via
          ?q= so it opens on an answer rather than an empty prompt box.
          href: null keeps the route working via router.push while hiding it
          from the tab bar itself. */}
      <Tabs.Screen
        name="copilot"
        options={{
          title: "Copilot",
          href: null,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}


