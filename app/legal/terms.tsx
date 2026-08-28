import React from "react";
import { Stack } from "expo-router";
import { TermsContent } from "@/components/LegalTermsContent";
export default function LegalTerms() { return <><Stack.Screen options={{ title: "Terms of Service" }} /><TermsContent /></>; }
