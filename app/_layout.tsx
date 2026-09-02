import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "@/lib/AuthProvider";
import { useVocab } from "@/lib/vocab";
import { color } from "@/theme";
import ErrorBoundary from "@/components/ErrorBoundary";
import { initErrorReporting } from "@/lib/errorReporting";

initErrorReporting();

function RootNavigator() {
  const { session, loading } = useAuth();
  const vocab = useVocab();
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.bg.page }}>
        <ActivityIndicator size="large" color={color.icon.brand} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: color.bg.surface },
        headerTintColor: color.text.primary,
        headerTitleStyle: { color: color.text.primary },
        contentStyle: { backgroundColor: color.bg.page },
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="create-club" options={{ headerShown: true, title: `Set Up Your ${vocab.organization.singular}` }} />
      <Stack.Screen name="club-management" options={{ headerShown: true, title: `${vocab.organization.singular} Management` }} />
      <Stack.Screen name="claim-player" options={{ headerShown: true, title: `Link a ${vocab.member.singular}` }} />
      <Stack.Screen name="event/[id]" options={{ headerShown: true, title: "Event" }} />
      <Stack.Screen name="modals/create-announcement" options={{ presentation: "modal", headerShown: true, title: "New Announcement" }} />
      <Stack.Screen name="modals/create-event" options={{ presentation: "modal", headerShown: true, title: "New Event" }} />
      <Stack.Screen
        name="modals/add-player"
        options={{ presentation: "modal", headerShown: true, title: `Add ${vocab.member.singular}` }}
      />
      <Stack.Screen
        name="modals/create-team"
        options={{ presentation: "modal", headerShown: true, title: `New ${vocab.group?.singular ?? "Team"}` }}
      />
      <Stack.Screen
        name="modals/evaluate-player"
        options={{ presentation: "modal", headerShown: true, title: `Evaluate ${vocab.member.singular}` }}
      />
      <Stack.Screen name="modals/voice-evaluation" options={{ presentation: "modal", headerShown: true, title: "Voice Evaluation" }} />
      <Stack.Screen name="modals/new-conversation" options={{ presentation: "modal", headerShown: true, title: "New Message" }} />
      <Stack.Screen name="modals/search-messages" options={{ presentation: "modal", headerShown: true, title: "Search Messages" }} />
      <Stack.Screen name="conversation/[id]" options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="player/[id]" options={{ headerShown: true }} />
      <Stack.Screen name="manage-drills" options={{ headerShown: true }} />
      <Stack.Screen name="pilot-metrics" options={{ headerShown: true }} />
      <Stack.Screen name="legal/terms" options={{ headerShown: true, title: "Terms of Service" }} />
      <Stack.Screen name="legal/privacy" options={{ headerShown: true, title: "Privacy Policy" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* The design is deliberately light-only (no dark mode), so the status
            bar must not follow the device's dark-mode setting — otherwise a
            device in dark mode renders white glyphs on this near-white page. */}
        <StatusBar style="dark" />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
