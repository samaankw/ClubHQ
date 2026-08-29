import React from "react";
import { View, ViewProps, StyleSheet } from "react-native";
import { color, radius, space, elevation } from "@/theme";

export interface CardProps extends ViewProps {
  padded?: boolean;
}

/** Default content container: white, rounded, softly raised off the page. */
export function Card({ padded = true, style, ...rest }: CardProps) {
  return <View style={[styles.base, styles.surface, padded && styles.pad, style]} {...rest} />;
}

/** Dark navy emphasis card — club access code, director's analysis. */
export function SpotlightCard({ padded = true, style, ...rest }: CardProps) {
  return <View style={[styles.base, styles.spotlight, padded && styles.pad, style]} {...rest} />;
}

/**
 * Brand-blue card reserved for AI-generated content. No call sites yet —
 * staged for mockup 03's "AI GENERATED ANALYSIS" card and mockup 04's
 * development-plan card, both still unconverted.
 */
export function AICard({ padded = true, style, ...rest }: CardProps) {
  return <View style={[styles.base, styles.ai, padded && styles.pad, style]} {...rest} />;
}

const styles = StyleSheet.create({
  // No overflow: "hidden" here — on iOS that sets clipsToBounds/masksToBounds,
  // which clips this same View's own shadow (elevation.card below), so the
  // card has no visible edge on a near-white page. Nothing currently inside
  // a Card needs corner clipping; if that changes, clip on an inner View
  // instead of this shadowed one.
  base: { borderRadius: radius.card },
  surface: { backgroundColor: color.bg.surface, ...elevation.card },
  spotlight: { backgroundColor: color.bg.spotlight },
  ai: { backgroundColor: color.bg.brand },
  pad: { padding: space[4] },
});
