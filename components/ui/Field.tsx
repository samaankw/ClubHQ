import React from "react";
import { View, TextInput, TextInputProps, StyleSheet } from "react-native";
import { Eyebrow, Text } from "./Text";
import { color, radius, space, type as typeTokens, borderWidth } from "@/theme";

export interface FieldProps extends TextInputProps {
  label?: string;
  /** Validation message. Renders the input in an error state with the text beneath. */
  error?: string;
}

let idCounter = 0;

export function Field({ label, style, multiline, error, id, testID, accessibilityHint, ...rest }: FieldProps) {
  const errorId = React.useMemo(() => id ?? `field-error-${++idCounter}`, [id]);

  return (
    <View style={styles.wrap}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={color.text.tertiary}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, error && styles.inputError, style]}
        // `aria-invalid`/`aria-errormessage` are honoured by react-native-web
        // but React Native maps neither on iOS or Android — they are dropped
        // silently, so on a device the error text renders as an unattached
        // caption a screen reader never associates with this input. The hint
        // is the one channel RN does announce, so the message goes there too.
        aria-invalid={error ? true : undefined}
        aria-errormessage={error ? errorId : undefined}
        accessibilityHint={error ?? accessibilityHint}
        {...rest}
      />
      {error ? (
        <Text role="caption" tone="danger" nativeID={errorId} id={errorId}>
          {error}
        </Text>
      ) : null}
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
  inputError: { borderColor: color.border.danger },
  multiline: { minHeight: space[10], textAlignVertical: "top" },
});
