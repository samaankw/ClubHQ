import React from "react";
import { View, TextInput, TextInputProps, StyleSheet } from "react-native";
import { Eyebrow } from "./Text";
import { color, radius, space, type as typeTokens, borderWidth } from "@/theme";

export interface FieldProps extends TextInputProps {
  label?: string;
}

export function Field({ label, style, multiline, ...rest }: FieldProps) {
  return (
    <View style={styles.wrap}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <TextInput
        placeholderTextColor={color.text.tertiary}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, style]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  input: {
    backgroundColor: color.bg.surface,
    borderWidth: borderWidth.thin,
    borderColor: color.border.subtle,
    borderRadius: radius.input,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    color: color.text.primary,
    fontSize: typeTokens.body.fontSize,
  },
  multiline: { minHeight: space[10], textAlignVertical: "top" },
});
