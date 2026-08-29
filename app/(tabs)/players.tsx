import React, { useCallback, useEffect, useState } from "react";
import { View, FlatList, Pressable, ScrollView, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Player, Team } from "@/types/db";
import { teamLabel } from "@/lib/teamLabel";
import { Screen, Text, Eyebrow, Card, Button, Chip, Avatar, EmptyState } from "@/components/ui";
import { color, space } from "@/theme";

export default function Players() {
  const { profile } = useAuth();

  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [playerToRemove, setPlayerToRemove] = useState<Player | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");

  const isCoachOrDirector =
    profile?.role === "coach" || profile?.role === "director";

  const load = useCallback(async () => {
    if (!profile?.id) {
      setPlayers([]);
      setTeams([]);
      setSelectedTeamId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      if (profile.role === "parent") {
        const { data, error } = await supabase
          .from("players")
          .select("*")
          .eq("parent_id", profile.id)
          .is("archived_at", null);

        if (error) {
          console.error("Failed to load parent players:", error.message);
        }

        setPlayers((data as Player[]) ?? []);
        setTeams([]);
        setSelectedTeamId(null);
        return;
      }

      if (!profile.club_id) {
        setPlayers([]);
        setTeams([]);
        setSelectedTeamId(null);
        return;
      }

      const [playersResult, teamsResult] = await Promise.all([
        supabase
          .from("players")
          .select("*, teams!inner(club_id)")
          .eq("teams.club_id", profile.club_id)
          .is("archived_at", null),

        supabase
          .from("teams")
          .select("*")
          .eq("club_id", profile.club_id)
          .is("archived_at", null)
          .order("name", { ascending: true }),
      ]);

      if (playersResult.error) {
        console.error(
          "Failed to load club players:",
          playersResult.error.message
        );
      }

      if (teamsResult.error) {
        console.error(
          "Failed to load teams:",
          teamsResult.error.message
        );
      }

      const nextPlayers =
        (playersResult.data as unknown as Player[]) ?? [];

      const nextTeams = (teamsResult.data as Team[]) ?? [];

      setPlayers(nextPlayers);
      setTeams(nextTeams);

      setSelectedTeamId((current) =>
        current && nextTeams.some((team) => team.id === current)
          ? current
          : null
      );
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.role, profile?.club_id]);

  useEffect(() => {
    load();
  }, [load]);

  const removePlayer = async () => {
    if (!playerToRemove) return;

    setRemoving(true);
    setRemoveError("");

    const { error } = await supabase
      .from("players")
      .update({
        archived_at: new Date().toISOString(),
      })
      .eq("id", playerToRemove.id);

    if (error) {
      console.error("Failed to remove player:", error.message);
      setRemoveError(error.message);
      setRemoving(false);
      return;
    }

    setPlayers((currentPlayers) =>
      currentPlayers.filter(
        (player) => player.id !== playerToRemove.id
      )
    );

    setPlayerToRemove(null);
    setRemoving(false);
  };

  const visiblePlayers = selectedTeamId
    ? players.filter(
        (player) => player.team_id === selectedTeamId
      )
    : players;

  return (
    <Screen scroll={false}>
      <FlatList
        style={styles.list}
        data={visiblePlayers}
        keyExtractor={(player) => player.id}
        onRefresh={load}
        refreshing={loading}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          isCoachOrDirector && teams.length > 0 ? (
            <Card style={styles.filterCard}>
              <Eyebrow>Team Filter</Eyebrow>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.teamRow}
              >
                <Chip
                  label="All Players"
                  selected={selectedTeamId === null}
                  onPress={() => setSelectedTeamId(null)}
                />

                {teams.map((team) => (
                  <Chip
                    key={team.id}
                    label={teamLabel(team)}
                    selected={selectedTeamId === team.id}
                    onPress={() => setSelectedTeamId(team.id)}
                  />
                ))}
              </ScrollView>

              {selectedTeamId ? (
                <Button
                  label="🎙️ Voice Evaluation for Selected Team"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/modals/voice-evaluation",
                      params: {
                        teamId: selectedTeamId,
                      },
                    })
                  }
                />
              ) : (
                <Text role="bodySm" tone="tertiary">
                  Choose a team above to start a whole-team
                  voice evaluation.
                </Text>
              )}
            </Card>
          ) : null
        }
        ListEmptyComponent={
          profile?.role === "parent" ? (
            <View style={styles.linkPrompt}>
              <EmptyState
                icon="link"
                title="No child linked yet"
                body="Joining the club doesn't automatically connect your child's record — your director gives you a separate one-time player code for that."
              />
              <Button label="Link a Player" onPress={() => router.push("/claim-player")} />
            </View>
          ) : (
            <EmptyState title="No players yet." />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.playerCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.full_name}
              style={styles.playerMain}
              onPress={() =>
                router.push(`/player/${item.id}` as never)
              }
            >
              <Avatar name={item.full_name} uri={item.photo_url} />

              <View style={styles.playerInfo}>
                <Text role="h3">
                  {item.full_name}
                </Text>

                {item.position ? (
                  <Text role="bodySm" tone="secondary">
                    {item.position}
                  </Text>
                ) : null}
              </View>

              <Ionicons name="chevron-forward" size={18} color={color.icon.muted} />
            </Pressable>

            {isCoachOrDirector && (
              <View style={styles.actions}>
                <Button
                  label="Evaluate"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    router.push({
                      pathname: "/modals/evaluate-player",
                      params: {
                        playerId: item.id,
                        playerName: item.full_name,
                      },
                    })
                  }
                />

                <Button
                  label="Remove"
                  variant="danger"
                  size="sm"
                  onPress={() => {
                    setRemoveError("");
                    setPlayerToRemove(item);
                  }}
                />
              </View>
            )}
          </Card>
        )}
      />

      <Modal
        visible={playerToRemove !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!removing) {
            setPlayerToRemove(null);
            setRemoveError("");
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text role="h1">
              Remove Player?
            </Text>

            <Text tone="secondary">
              Are you sure you want to remove{" "}
              <Text tone="primary">
                {playerToRemove?.full_name}
              </Text>
              {" "}from the active roster?
            </Text>

            <Text role="bodySm" tone="tertiary">
              Their existing history will be preserved.
            </Text>

            {removeError ? (
              <Text role="bodySm" tone="danger">
                {removeError}
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="secondary"
                disabled={removing}
                onPress={() => {
                  setPlayerToRemove(null);
                  setRemoveError("");
                }}
              />

              <Button
                label={removing ? "Removing…" : "Remove Player"}
                variant="danger"
                disabled={removing}
                onPress={removePlayer}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },

  listContent: {
    padding: space[4],
    gap: space[3],
  },

  filterCard: {
    gap: space[3],
  },

  teamRow: {
    gap: space[2],
  },

  linkPrompt: {
    gap: space[4],
  },

  playerCard: {
    gap: space[3],
  },

  playerMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },

  playerInfo: {
    flex: 1,
    gap: space[1],
  },

  actions: {
    flexDirection: "row",
    gap: space[2],
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: space[5],
  },

  modalCard: {
    width: "100%",
    maxWidth: 440,
    gap: space[3],
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space[2],
  },
});
