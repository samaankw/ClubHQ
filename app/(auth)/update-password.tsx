import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { notify } from "@/lib/alertCompat";

export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const update = async () => {
    if (password.length < 8) return notify("Password too short", "Use at least 8 characters.");
    if (password !== confirm) return notify("Passwords don't match", "Re-enter the same password twice.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return notify("Couldn't update password", error.message);
    notify("Password updated", "Your new password is ready to use.");
    router.replace("/(tabs)/dashboard");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose a new password</Text>
      <TextInput style={styles.input} placeholder="New password" secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput style={styles.input} placeholder="Confirm new password" secureTextEntry value={confirm} onChangeText={setConfirm} />
      <Pressable style={styles.button} onPress={update} disabled={loading}><Text style={styles.buttonText}>{loading ? "Updating…" : "Update Password"}</Text></Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "800", color: "#0F4C81", textAlign: "center", marginBottom: 22 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: "#0F4C81", borderRadius: 10, padding: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
});
