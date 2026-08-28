import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Player, Team } from "@/types/db";
import { teamLabel } from "@/lib/teamLabel";

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
    <View style={styles.container}>
      <FlatList
        data={visiblePlayers}
        keyExtractor={(player) => player.id}
        onRefresh={load}
        refreshing={loading}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          isCoachOrDirector && teams.length > 0 ? (
            <View style={styles.teamSection}>
              <Text style={styles.teamLabel}>TEAM FILTER</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.teamRow}
              >
                <Pressable
                  style={[
                    styles.teamChip,
                    selectedTeamId === null &&
                      styles.teamChipActive,
                  ]}
                  onPress={() => setSelectedTeamId(null)}
                >
                  <Text
                    style={[
                      styles.teamChipText,
                      selectedTeamId === null &&
                        styles.teamChipTextActive,
                    ]}
                  >
                    All Players
                  </Text>
                </Pressable>

                {teams.map((team) => (
                  <Pressable
                    key={team.id}
                    style={[
                      styles.teamChip,
                      selectedTeamId === team.id &&
                        styles.teamChipActive,
                    ]}
                    onPress={() => setSelectedTeamId(team.id)}
                  >
                    <Text
                      style={[
                        styles.teamChipText,
                        selectedTeamId === team.id &&
                          styles.teamChipTextActive,
                      ]}
                    >
                      {teamLabel(team)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {selectedTeamId ? (
                <Pressable
                  style={styles.voiceButton}
                  onPress={() =>
                    router.push({
                      pathname: "/modals/voice-evaluation",
                      params: {
                        teamId: selectedTeamId,
                      },
                    })
                  }
                >
                  <Text style={styles.voiceButtonText}>
                    🎙️ Voice Evaluation for Selected Team
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.voiceHint}>
                  Choose a team above to start a whole-team
                  voice evaluation.
                </Text>
              )}
            </View>
          ) : null
        }
        ListEmptyComponent={
          profile?.role === "parent" ? (
            <View style={styles.linkPrompt}>
              <Text style={styles.linkPromptTitle}>No child linked yet</Text>
              <Text style={styles.linkPromptCopy}>
                Joining the club doesn't automatically connect your child's record — your director gives you a separate one-time player code for that.
              </Text>
              <Pressable style={styles.linkPromptButton} onPress={() => router.push("/claim-player")}>
                <Text style={styles.linkPromptButtonText}>Link a Player</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.muted}>No players yet.</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push(`/player/${item.id}` as never)
            }
          >
            <View style={styles.playerInfo}>
              <Text style={styles.name}>
                {item.full_name}
              </Text>

              {item.position ? (
                <Text style={styles.meta}>
                  {item.position}
                </Text>
              ) : null}
            </View>

            {isCoachOrDirector && (
              <View style={styles.actions}>
                <Pressable
                  style={styles.evalButton}
                  onPress={(event) => {
                    event.stopPropagation();

                    router.push({
                      pathname: "/modals/evaluate-player",
                      params: {
                        playerId: item.id,
                        playerName: item.full_name,
                      },
                    });
                  }}
                >
                  <Text style={styles.evalButtonText}>
                    Evaluate
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.removeButton}
                  onPress={(event) => {
                    event.stopPropagation();
                    setRemoveError("");
                    setPlayerToRemove(item);
                  }}
                >
                  <Text style={styles.removeButtonText}>
                    Remove
                  </Text>
                </Pressable>
              </View>
            )}
          </Pressable>
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
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Remove Player?
            </Text>

            <Text style={styles.modalText}>
              Are you sure you want to remove{" "}
              <Text style={styles.modalPlayerName}>
                {playerToRemove?.full_name}
              </Text>
              {" "}from the active roster?
            </Text>

            <Text style={styles.modalHint}>
              Their existing history will be preserved.
            </Text>

            {removeError ? (
              <Text style={styles.errorText}>
                {removeError}
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelButton}
                disabled={removing}
                onPress={() => {
                  setPlayerToRemove(null);
                  setRemoveError("");
                }}
              >
                <Text style={styles.cancelButtonText}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.confirmRemoveButton,
                  removing && styles.disabledButton,
                ]}
                disabled={removing}
                onPress={removePlayer}
              >
                <Text style={styles.confirmRemoveText}>
                  {removing ? "Removing..." : "Remove Player"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0B0D",
  },

  card: {
    backgroundColor: "#141416",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  playerInfo: {
    flex: 1,
  },

  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F2F2F3",
  },

  meta: {
    fontSize: 13,
    color: "#9A9DA3",
    marginTop: 2,
  },

  muted: {
    color: "#6B6F76",
    textAlign: "center",
    marginTop: 40,
  },

  linkPrompt: {
    marginTop: 40,
    marginHorizontal: 8,
    backgroundColor: "#141416",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
  },
  linkPromptTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#F2F2F3",
    marginBottom: 8,
  },
  linkPromptCopy: {
    fontSize: 13,
    color: "#9A9DA3",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 16,
  },
  linkPromptButton: {
    backgroundColor: "#0A6CFF",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  linkPromptButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  evalButton: {
    backgroundColor: "#0A6CFF",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },

  evalButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  removeButton: {
    backgroundColor: "#3A1616",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },

  removeButtonText: {
    color: "#FF6B6B",
    fontWeight: "700",
    fontSize: 13,
  },

  teamSection: {
    marginBottom: 14,
  },

  teamLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9A9DA3",
    marginBottom: 8,
    letterSpacing: 0.5,
  },

  teamRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingBottom: 12,
  },

  teamChip: {
    borderWidth: 1,
    borderColor: "#0A6CFF",
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#141416",
  },

  teamChipActive: {
    backgroundColor: "#0A6CFF",
  },

  teamChipText: {
    color: "#0A6CFF",
    fontWeight: "600",
    fontSize: 13,
  },

  teamChipTextActive: {
    color: "#fff",
  },

  voiceButton: {
    backgroundColor: "#17181B",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },

  voiceButtonText: {
    color: "#0A6CFF",
    fontWeight: "700",
  },

  voiceHint: {
    color: "#6B6F76",
    fontSize: 12,
    paddingHorizontal: 2,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#141416",
    borderRadius: 18,
    padding: 24,
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#F2F2F3",
    marginBottom: 12,
  },

  modalText: {
    fontSize: 16,
    color: "#B5B8BE",
    lineHeight: 23,
  },

  modalPlayerName: {
    fontWeight: "800",
    color: "#F2F2F3",
  },

  modalHint: {
    fontSize: 13,
    color: "#9A9DA3",
    marginTop: 10,
  },

  errorText: {
    color: "#FF6B6B",
    marginTop: 14,
    fontWeight: "600",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 24,
  },

  cancelButton: {
    borderWidth: 1,
    borderColor: "#3A3B3E",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },

  cancelButtonText: {
    color: "#B5B8BE",
    fontWeight: "700",
  },

  confirmRemoveButton: {
    backgroundColor: "#FF453A",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },

  confirmRemoveText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  disabledButton: {
    opacity: 0.6,
  },
});