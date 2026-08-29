import React from "react";
import { Text as RNText, TextProps as RNTextProps } from "react-native";
import { color, type as typeTokens } from "@/theme";

export type TextRole = keyof typeof typeTokens;
export type TextTone = keyof typeof color.text;

export interface TextProps extends RNTextProps {
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
