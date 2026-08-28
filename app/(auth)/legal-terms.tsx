import React from "react";
import { Stack } from "expo-router";
import { TermsContent } from "@/components/LegalTermsContent";
export default function TermsPreAuth() { return <><Stack.Screen options={{ title: "Terms of Service", headerShown: true }} /><TermsContent /></>; }
