import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Profile } from "@/types/db";

export default function CoachesSection() {
  const { profile } = useAuth();
  const [coaches, setCoaches] = useState<Profile[]>([]);

  useEffect(() => {
    (async () => {
      if (!profile?.club_id) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("club_id", profile.club_id)
        .in("role", ["coach", "director"])
        .order("role", { ascending: false }) // directors first
        .order("full_name");
      setCoaches((data as Profile[]) ?? []);
    })();
  }, [profile?.club_id]);

  if (!coaches.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>MEET THE COACHES</Text>
      {coaches.map((coach) => (
        <View key={coach.id} style={styles.card}>
          {coach.avatar_url ? (
            <Image source={{ uri: coach.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{coach.full_name?.[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          )}
          <View style={styles.info}>
            <Text style={styles.name}>{coach.full_name}</Text>
            <Text style={styles.title}>{coach.coach_title || (coach.role === "director" ? "Director" : "Coach")}</Text>
            {coach.coach_bio ? <Text style={styles.bio}>{coach.coach_bio}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: "700", color: "#9A9DA3", letterSpacing: 0.5, marginBottom: 10 },
  card: {
    flexDirection: "row",
    backgroundColor: "#141416",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  avatarImage: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#0A6CFF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 20, fontWeight: "800" },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "700", color: "#F2F2F3" },
  title: { fontSize: 12, fontWeight: "700", color: "#0A6CFF", marginTop: 1, textTransform: "uppercase", letterSpacing: 0.3 },
  bio: { fontSize: 13, color: "#B5B8BE", marginTop: 6, lineHeight: 18 },
});
