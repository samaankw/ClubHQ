import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { router, Stack } from "expo-router";
import { isValid, parse } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Team } from "@/types/db";
import { notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { goBackOr } from "@/lib/navigation";
import { userFacingDbError } from "@/lib/dbErrors";
import ModalBackButton from "@/components/ModalBackButton";
import { Screen, Card, Eyebrow, Text, Field, Button, Chip, EmptyState } from "@/components/ui";
import { color, space } from "@/theme";

export default function AddPlayer() {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [teamError, setTeamError] = useState<string | undefined>();
  const [birthDateError, setBirthDateError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const loadTeams = useCallback(async () => {
    if (!profile?.club_id) {
      setLoadingTeams(false);
      return;
    }
    setLoadingTeams(true);
    setLoadFailed(false);
    const { data, error } = await supabase.from("teams").select("*").eq("club_id", profile.club_id).is("archived_at", null).order("name");
    if (error) {
      // Distinguished from a genuine zero-row result: telling a director with
      // six teams that they have none sends them off to create a duplicate.
      console.error("Failed to load teams:", error.message);
      setLoadFailed(true);
      setLoadingTeams(false);
      return;
    }
    const next = (data as Team[]) ?? [];
    setTeams(next);
    // A club with exactly one team has only one place a new player could
    // go — the same "no ceremony" rule club-management already applies
    // when there's only one coach to assign. Skip the picker, use it.
    if (next.length === 1) setTeamId(next[0].id);
    setLoadingTeams(false);
  }, [profile?.club_id]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

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
    // Shape alone isn't enough: "2026-13-45" matches the pattern and would
    // reach Postgres, which answers in its own vocabulary.
    if (birthDate && !isValid(parse(birthDate, "yyyy-MM-dd", new Date()))) {
      setBirthDateError("Use a real date as YYYY-MM-DD, or leave it blank.");
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
    if (error) {
      console.error("Failed to add player:", error.message);
      return notify("Couldn't add player", userFacingDbError(error.message, "Try again in a moment."));
    }
    goBackOr("/(tabs)/players");
  };

  const header = (
    <Stack.Screen
      options={{
        title: "Add Player",
        headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/players")} />,
      }}
    />
  );

  // Only directors can add players — RLS refuses the insert for anyone else,
  // and these modal routes are registered at the root stack, so any signed-in
  // role can reach them by deep link. Mirrors club-management's own guard.
  if (profile && profile.role !== "director") {
    return (
      <Screen>
        {header}
        <EmptyState icon="lock-closed" title="Directors only" body="Only club directors can add players to a roster." />
      </Screen>
    );
  }

  if (loadingTeams) {
    return (
      <Screen>
        {header}
        <View style={styles.loading}>
          <ActivityIndicator color={color.icon.brand} />
          <Text tone="secondary">Loading your teams…</Text>
        </View>
      </Screen>
    );
  }

  if (loadFailed) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="cloud-offline"
          title="Couldn't load your teams"
          body="We couldn't reach the server. Check your connection and try again."
        />
        <Button label="Try Again" onPress={loadTeams} fullWidth />
      </Screen>
    );
  }

  if (teams.length === 0) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="people"
          title="No teams yet"
          body="A player has to belong to a team — create one first, then come back to add players."
        />
        <Button label="Create a Team" onPress={() => router.replace("/modals/create-team")} fullWidth />
      </Screen>
    );
  }

  const selectedTeam = teams.find((t) => t.id === teamId) ?? null;

  return (
    <Screen>
      {header}

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
          </View>
        ) : selectedTeam ? (
          <Text tone="secondary">Adding to {teamLabel(selectedTeam)}</Text>
        ) : null}

        {/* Rendered outside the picker branch: it used to live inside the
            multi-team block, so a state that set it without showing a picker
            set an error the user could never see. */}
        {teamError ? (
          <Text role="caption" tone="danger">
            {teamError}
          </Text>
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
  loading: { alignItems: "center", gap: space[3], paddingVertical: space[8] },
});
