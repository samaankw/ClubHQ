import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Profile } from "@/types/db";
import { Card, Eyebrow, Text, Avatar, Divider } from "@/components/ui";
import { space } from "@/theme";

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
    <Card style={styles.container}>
      <Eyebrow>Meet the Coaches</Eyebrow>
      {coaches.map((coach, i) => (
        <React.Fragment key={coach.id}>
          {i > 0 && <Divider />}
          <View style={styles.row}>
            <Avatar uri={coach.avatar_url} name={coach.full_name ?? "?"} size={52} />
            <View style={styles.info}>
              <Text role="h3">{coach.full_name}</Text>
              <Eyebrow tone="brand">{coach.coach_title || (coach.role === "director" ? "Director" : "Coach")}</Eyebrow>
              {coach.coach_bio ? <Text tone="secondary">{coach.coach_bio}</Text> : null}
            </View>
          </View>
        </React.Fragment>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[3] },
  row: { flexDirection: "row", gap: space[3], paddingVertical: space[2] },
  info: { flex: 1, gap: space[1] },
});
