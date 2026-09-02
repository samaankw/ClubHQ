import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { useVocab } from "@/lib/vocab";
import { notify } from "@/lib/alertCompat";
import { goBackOr } from "@/lib/navigation";
import { userFacingDbError } from "@/lib/dbErrors";
import ModalBackButton from "@/components/ModalBackButton";
import { Screen, Card, Eyebrow, Field, Button } from "@/components/ui";
import NotAuthorized from "@/components/NotAuthorized";
import { space } from "@/theme";

export default function CreateTeam() {
  const { profile } = useAuth();
  const vocab = useVocab();
  const groupWord = vocab.group?.singular ?? "Team";
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [season, setSeason] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    // Checked apart from the name so a missing club doesn't get reported as
    // a missing team name — two different problems with two different fixes.
    if (!profile?.club_id) {
      return notify("No club found", "Your profile isn't linked to a club yet.");
    }
    if (!name.trim()) {
      setNameError(`Enter a ${groupWord.toLowerCase()} name first.`);
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
    if (error) {
      console.error("Failed to create team:", error.message);
      return notify(`Couldn't create ${groupWord.toLowerCase()}`, userFacingDbError(error.message, "Try again in a moment."));
    }
    goBackOr("/club-management");
  };

  const header = (
    <Stack.Screen
      options={{
        title: `New ${groupWord}`,
        headerLeft: () => <ModalBackButton onPress={() => goBackOr("/club-management")} />,
      }}
    />
  );

  // These modal routes are registered at the root stack, so any signed-in role
  // can reach them by deep link. RLS refuses the insert regardless; this stops
  // a coach filling in a form that was never going to submit.
  if (profile && profile.role !== "director") {
    return (
      <Screen>
        {header}
        <NotAuthorized
          title="Directors only"
          body={`Only club directors can create ${groupWord.toLowerCase()}s.`}
          fallback="/club-management"
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}

      <Card style={styles.card}>
        <Eyebrow>{groupWord} Details</Eyebrow>
        <Field
          placeholder={`${groupWord} name, e.g. U10 Boys Red`}
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

        <Button label={submitting ? "Creating…" : `Create ${groupWord}`} onPress={handleSubmit} disabled={submitting} fullWidth />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  row: { flexDirection: "row", gap: space[3] },
});
