import React from "react";
import { Text as RNText, TextProps as RNTextProps } from "react-native";
import { color, type as typeTokens } from "@/theme";

export type TextRole = keyof typeof typeTokens;
export type TextTone = keyof typeof color.text;

// Omit RN's own "role" (an accessibility/web-aligned prop, e.g. "heading",
// "link") since this component's "role" means something different: a
// semantic typography role that maps to a type-scale token. This is purely
// a type-level fix — RN's separate "accessibilityRole" prop is untouched.
export interface TextProps extends Omit<RNTextProps, "role"> {
  role?: TextRole;
  tone?: TextTone;
}

/**
 * The only text primitive. Takes a semantic role rather than a font size, so
 * there is no way to introduce a 20th type size by accident.
 */
export function Text({ role = "body", tone = "primary", style, ...rest }: TextProps) {
  return <RNText style={[typeTokens[role], { color: color.text[tone] }, style]} {...rest} />;
}

/** Uppercase letterspaced section kicker — the signature label of this design. */
export function Eyebrow({ tone = "tertiary", ...rest }: Omit<TextProps, "role">) {
  return <Text role="eyebrow" tone={tone} {...rest} />;
}
