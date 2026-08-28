import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export async function registerPushToken(userId: string) {
  try {
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || (Constants.expoConfig?.extra?.eas?.projectId as string | undefined);
    if (!projectId || projectId.includes("EAS_PROJECT_ID_HERE")) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "ClubHQ",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== "granted") permissions = await Notifications.requestPermissionsAsync();
    if (permissions.status !== "granted") return;

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from("push_tokens").upsert(
      { user_id: userId, expo_push_token: token.data, platform: Platform.OS },
      { onConflict: "user_id,expo_push_token" }
    );
  } catch (error) {
    console.warn("Push registration skipped:", error instanceof Error ? error.message : error);
  }
}
