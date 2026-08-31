import React, { useEffect, useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { router, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Team } from "@/types/db";
import { notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";
import { Screen, Card, Eyebrow, Text, Field, Button, Chip, EmptyState } from "@/components/ui";
import { space } from "@/theme";

export default function AddPlayer() {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [teamError, setTeamError] = useState<string | undefined>();
  const [birthDateError, setBirthDateError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!profile?.club_id) {
        setLoadingTeams(false);
        return;
      }
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("club_id", profile.club_id)
        .is("archived_at", null)
        .order("name");
      if (error) console.error("Failed to load teams:", error.message);
      const next = (data as Team[]) ?? [];
      setTeams(next);
      // A club with exactly one team has only one place a new player could
      // go — the same "no ceremony" rule club-management already applies
      // when there's only one coach to assign. Skip the picker, use it.
      if (next.length === 1) setTeamId(next[0].id);
      setLoadingTeams(false);
    })();
  }, [profile?.club_id]);

  const handleSubmit = async () => {
    let hasError = false;
    if (!name.trim()) {
      setNameError("Enter the player's name.");
      hasError = true;
    } else {
      setNameError(undefined);
    }
    if (!teamId) {
      setTeamError("Choose a team first.");
      hasError = true;
    } else {
      setTeamError(undefined);
    }
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setBirthDateError("Use YYYY-MM-DD or leave it blank.");
      hasError = true;
    } else {
      setBirthDateError(undefined);
    }
    if (hasError) return;

    setSubmitting(true);
    const { error } = await supabase.from("players").insert({
      team_id: teamId,
      full_name: name.trim(),
      position: position.trim() || null,
      birth_date: birthDate || null,
    });
    setSubmitting(false);
    if (error) return notify("Couldn't add player", error.message);
    goBackOr("/(tabs)/players");
  };

  if (!loadingTeams && teams.length === 0) {
    return (
      <Screen>
        <Stack.Screen
          options={{
            title: "Add Player",
            headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/players")} />,
          }}
        />
        <EmptyState
          icon="people"
          title="No teams yet"
          body="A player has to belong to a team — create one first, then come back to add players."
        />
        <Button label="Go to Club Management" onPress={() => router.push("/club-management")} fullWidth />
      </Screen>
    );
  }

  const selectedTeam = teams.find((t) => t.id === teamId) ?? null;

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: "Add Player",
          headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/players")} />,
        }}
      />

      <Card style={styles.card}>
        {teams.length > 1 ? (
          <View style={styles.section}>
            <Eyebrow>Team</Eyebrow>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {teams.map((team) => (
                <Chip
                  key={team.id}
                  label={teamLabel(team)}
                  selected={teamId === team.id}
                  onPress={() => {
                    setTeamId(team.id);
                    if (teamError) setTeamError(undefined);
                  }}
                />
              ))}
            </ScrollView>
            {teamError ? (
              <Text role="caption" tone="danger">
                {teamError}
              </Text>
            ) : null}
          </View>
        ) : selectedTeam ? (
          <Text tone="secondary">Adding to {teamLabel(selectedTeam)}</Text>
        ) : null}

        <Field
          placeholder="Player full name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (nameError) setNameError(undefined);
          }}
          error={nameError}
        />
        <Field placeholder="Position (optional)" value={position} onChangeText={setPosition} />
        <Field
          placeholder="Birth date YYYY-MM-DD (optional)"
          value={birthDate}
          onChangeText={(v) => {
            setBirthDate(v);
            if (birthDateError) setBirthDateError(undefined);
          }}
          error={birthDateError}
        />

        <Button label={submitting ? "Adding…" : "Add Player"} onPress={handleSubmit} disabled={submitting} fullWidth />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  section: { gap: space[2] },
  chipRow: { flexDirection: "row", gap: space[2] },
});
