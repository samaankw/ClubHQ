import React, { useCallback, useEffect, useState } from "react";
import { View, FlatList, Pressable, ScrollView, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Player, Team } from "@/types/db";
import { teamLabel } from "@/lib/teamLabel";
import { useAsyncData } from "@/lib/asyncData";
import ListState from "@/components/ListState";
import { Screen, Text, Eyebrow, Card, Button, Chip, Avatar, EmptyState } from "@/components/ui";
import { color, space, layout, radius, elevation } from "@/theme";

interface PlayersData {
  players: Player[];
  teams: Team[];
}

const EMPTY_PLAYERS_DATA: PlayersData = { players: [], teams: [] };

export default function Players() {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const role = profile?.role;
  const clubId = profile?.club_id;

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [playerToRemove, setPlayerToRemove] = useState<Player | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");

  const isCoachOrDirector = role === "coach" || role === "director";
  // players_insert_staff (RLS) only allows a director to insert — a coach
  // or parent must never see a button the database would reject.
  const canCreate = role === "director";

  const {
    data: { players, teams },
    loading,
    error,
    retry: load,
    setData,
  } = useAsyncData<PlayersData>(
    async () => {
      if (!profileId) return EMPTY_PLAYERS_DATA;

      if (role === "parent") {
        const { data, error } = await supabase.from("players").select("*").eq("parent_id", profileId).is("archived_at", null);
        if (error) throw error;
        return { players: (data as Player[]) ?? [], teams: [] };
      }

      if (!clubId) return EMPTY_PLAYERS_DATA;

      const [playersResult, teamsResult] = await Promise.all([
        supabase.from("players").select("*, teams!inner(club_id)").eq("teams.club_id", clubId).is("archived_at", null),

        supabase.from("teams").select("*").eq("club_id", clubId).is("archived_at", null).order("name", { ascending: true }),
      ]);

      if (playersResult.error) throw playersResult.error;
      if (teamsResult.error) throw teamsResult.error;

      return {
        players: (playersResult.data as unknown as Player[]) ?? [],
        teams: (teamsResult.data as Team[]) ?? [],
      };
    },
    [profileId, role, clubId],
    EMPTY_PLAYERS_DATA,
  );

  useEffect(() => {
    setSelectedTeamId((current) => (current && teams.some((team) => team.id === current) ? current : null));
  }, [teams]);

  // useFocusEffect (not a plain mount useEffect) so returning from the
  // add-player modal — which lands back on this already-mounted screen —
  // still reloads the roster and shows the new player.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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
      setRemoveError(error.message);
      setRemoving(false);
      return;
    }

    setData((prev) => ({ ...prev, players: prev.players.filter((player) => player.id !== playerToRemove.id) }));

    setPlayerToRemove(null);
    setRemoving(false);
  };

  const visiblePlayers = selectedTeamId ? players.filter((player) => player.team_id === selectedTeamId) : players;

  return (
    <Screen scroll={false}>
      <View style={styles.listWrap}>
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

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamRow}>
                  <Chip label="All Players" selected={selectedTeamId === null} onPress={() => setSelectedTeamId(null)} />

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
                    Choose a team above to start a whole-team voice evaluation.
                  </Text>
                )}
              </Card>
            ) : null
          }
          ListEmptyComponent={
            <ListState loading={loading} error={error} isEmpty={false} onRetry={load} emptyTitle="">
              {profile?.role === "parent" ? (
                <View style={styles.linkPrompt}>
                  <EmptyState
                    icon="link"
                    title="No child linked yet"
                    body="Joining the club doesn't automatically connect your child's record — your director gives you a separate one-time player code for that."
                  />
                  <Button label="Link a Player" onPress={() => router.push("/claim-player")} />
                </View>
              ) : profile?.role === "director" ? (
                // Adding a player is director-gated in RLS (`players_insert_staff`),
                // so only a director gets the button here. It opens the same
                // modal as the FAB — the two render at once when the list is
                // empty, and sending them to different screens made one of them
                // look like a different feature.
                <View style={styles.linkPrompt}>
                  <EmptyState icon="people" title="No players yet" body="Start building your roster by adding your first player." />
                  <Button label="Add a Player" onPress={() => router.push("/modals/add-player")} />
                </View>
              ) : (
                <EmptyState icon="people" title="No players yet" body="Ask your director to add players to get the roster started." />
              )}
            </ListState>
          }
          renderItem={({ item }) => (
            <Card style={styles.playerCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.full_name}
                style={styles.playerMain}
                onPress={() => router.push(`/player/${item.id}` as never)}
              >
                <Avatar name={item.full_name} uri={item.photo_url} />

                <View style={styles.playerInfo}>
                  <Text role="h3">{item.full_name}</Text>

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
        {canCreate && (
          <Pressable
            style={styles.fab}
            onPress={() => router.push("/modals/add-player")}
            accessibilityRole="button"
            accessibilityLabel="Add player"
          >
            <Ionicons name="add" size={28} color={color.icon.inverse} />
          </Pressable>
        )}
      </View>

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
            <Text role="h1">Remove Player?</Text>

            <Text tone="secondary">
              Are you sure you want to remove <Text tone="primary">{playerToRemove?.full_name}</Text> from the active roster?
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

              <Button label={removing ? "Removing…" : "Remove Player"} variant="danger" disabled={removing} onPress={removePlayer} />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listWrap: {
    flex: 1,
  },

  list: {
    flex: 1,
  },

  listContent: {
    padding: space[4],
    gap: space[4],
    // Clear the FAB (56pt tall, 24pt from the bottom) so it can't sit on top
    // of the last card in a full roster.
    paddingBottom: space[6] + 56 + space[4],
  },

  fab: {
    position: "absolute",
    right: space[5],
    bottom: space[6],
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: color.bg.brand,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.raised,
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
    backgroundColor: color.bg.scrim,
    alignItems: "center",
    justifyContent: "center",
    padding: space[5],
  },

  modalCard: {
    width: "100%",
    maxWidth: layout.maxContent,
    gap: space[3],
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space[2],
  },
});
