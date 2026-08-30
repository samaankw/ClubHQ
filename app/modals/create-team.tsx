import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";
import { Screen, Card, Eyebrow, Field, Button } from "@/components/ui";
import { space } from "@/theme";

export default function CreateTeam() {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [season, setSeason] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!profile?.club_id || !name.trim()) {
      setNameError("Enter a team name first.");
      return;
    }
    setNameError(undefined);

    setSubmitting(true);
    // Assign the creating director to their own team straight away. A director
    // who just made a team is its coach until they say otherwise — making them
    // pick themselves out of a one-name list is ceremony, and leaving it unset
    // shows "No coach assigned" on a team they personally created.
    const { data: created, error } = await supabase
      .from("teams")
      .insert({ club_id: profile.club_id, name: name.trim(), age_group: ageGroup.trim() || null, season: season.trim() || null })
      .select("id")
      .single();
    if (!error && created?.id) {
      const { error: assignError } = await supabase.rpc("set_team_coach", {
        p_team_id: created.id,
        p_coach_id: profile.id,
        p_assigned: true,
      });
      // Non-fatal: the team exists either way, and they can assign manually.
      if (assignError) console.error("Couldn't self-assign as coach:", assignError.message);
    }
    setSubmitting(false);
    if (error) return notify("Couldn't create team", error.message);
    goBackOr("/club-management");
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: "New Team",
          headerLeft: () => <ModalBackButton onPress={() => goBackOr("/club-management")} />,
        }}
      />

      <Card style={styles.card}>
        <Eyebrow>Team Details</Eyebrow>
        <Field
          placeholder="Team name, e.g. U10 Boys Red"
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (nameError) setNameError(undefined);
          }}
          error={nameError}
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field placeholder="Age group (optional)" value={ageGroup} onChangeText={setAgeGroup} />
          </View>
          <View style={{ flex: 1 }}>
            <Field placeholder="Season (optional)" value={season} onChangeText={setSeason} />
          </View>
        </View>

        <Button label={submitting ? "Creating…" : "Create Team"} onPress={handleSubmit} disabled={submitting} fullWidth />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  row: { flexDirection: "row", gap: space[3] },
});
