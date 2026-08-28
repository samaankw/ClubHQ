import React from "react";
import { Stack } from "expo-router";
import { PrivacyPolicyContent } from "@/components/LegalTermsContent";
export default function PrivacyPreAuth() { return <><Stack.Screen options={{ title: "Privacy Policy", headerShown: true }} /><PrivacyPolicyContent /></>; }
