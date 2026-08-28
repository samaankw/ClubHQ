import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, router, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "@/lib/AuthProvider";

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) router.replace("/(auth)/login");
  }, [session, loading, segments]);

  // Tapping a push notification (announcement, message, etc.) should land
  // the user on the relevant screen, same as GroupMe/TeamSnap opening
  // straight into the conversation/announcement the notification was about.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string; eventId?: string } | undefined;
      if (data?.type === "announcement") {
        router.push("/(tabs)/schedule?section=announcements");
      } else if (data?.type === "event" && data.eventId) {
        router.push(`/event/${data.eventId}`);
      }
    });
    return () => sub.remove();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B0B0D" }}>
        <ActivityIndicator size="large" color="#0A6CFF" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: "#0B0B0D" },
        headerTintColor: "#F2F2F3",
        headerTitleStyle: { color: "#F2F2F3" },
        contentStyle: { backgroundColor: "#0B0B0D" },
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="create-club" options={{ headerShown: true, title: "Set Up Your Club" }} />
      <Stack.Screen name="club-management" options={{ headerShown: true, title: "Club Management" }} />
      <Stack.Screen name="claim-player" options={{ headerShown: true, title: "Link a Player" }} />
      <Stack.Screen name="event/[id]" options={{ headerShown: true, title: "Event" }} />
      <Stack.Screen name="modals/create-announcement" options={{ presentation: "modal", headerShown: true, title: "New Announcement" }} />
      <Stack.Screen name="modals/create-event" options={{ presentation: "modal", headerShown: true, title: "New Event" }} />
      <Stack.Screen name="modals/evaluate-player" options={{ presentation: "modal", headerShown: true, title: "Evaluate Player" }} />
      <Stack.Screen name="modals/voice-evaluation" options={{ presentation: "modal", headerShown: true, title: "Voice Evaluation" }} />
      <Stack.Screen name="modals/new-conversation" options={{ presentation: "modal", headerShown: true, title: "New Message" }} />
      <Stack.Screen name="modals/search-messages" options={{ presentation: "modal", headerShown: true, title: "Search Messages" }} />
      <Stack.Screen name="conversation/[id]" options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="player/[id]" options={{ headerShown: true }} />
      <Stack.Screen name="manage-drills" options={{ headerShown: true }} />
      <Stack.Screen name="pilot-metrics" options={{ headerShown: true }} />
      {/* Legal pages deliberately stay light/neutral regardless of the app's
          dark theme — these are about legibility and trust, not branding. */}
      <Stack.Screen
        name="legal/terms"
        options={{ headerShown: true, title: "Terms of Service", headerStyle: { backgroundColor: "#fff" }, headerTintColor: "#0F4C81", headerTitleStyle: { color: "#1a1a1a" }, contentStyle: { backgroundColor: "#fff" } }}
      />
      <Stack.Screen
        name="legal/privacy"
        options={{ headerShown: true, title: "Privacy Policy", headerStyle: { backgroundColor: "#fff" }, headerTintColor: "#0F4C81", headerTitleStyle: { color: "#1a1a1a" }, contentStyle: { backgroundColor: "#fff" } }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
