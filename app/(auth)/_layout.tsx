import { Stack, Redirect, useSegments } from "expo-router";
import { useAuth } from "@/lib/AuthProvider";

export default function AuthLayout() {
  const { session } = useAuth();
  const segments = useSegments();
  const leaf = (segments as string[])[1];
  const publicWhenSignedIn = leaf === "legal-terms" || leaf === "update-password";

  if (session && !publicWhenSignedIn) return <Redirect href="/(tabs)/dashboard" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
