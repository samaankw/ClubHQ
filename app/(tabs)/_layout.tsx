import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { Tabs, Redirect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/lib/AuthProvider";
import { registerPushToken } from "@/lib/notifications";
import { useUnreadAnnouncementsCount } from "@/lib/hooks";
import { color, space, type } from "@/theme";

export default function TabsLayout() {
  const { profile } = useAuth();
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
        tabBarActiveTintColor: color.text.brand,
        tabBarInactiveTintColor: color.text.tertiary,
        tabBarStyle: {
          backgroundColor: color.bg.surface,
          borderTopColor: color.border.subtle,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: space[9] + space[4],
          paddingTop: space[2],
          paddingBottom: space[3],
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
          role — reachable from Profile instead of taking a permanent slot
          in an already-crowded tab bar. href: null keeps the route working
          via router.push while hiding it from the tab bar itself. */}
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


