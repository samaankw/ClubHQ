import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, findNodeHandle, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, addMonths, startOfMonth } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { PaymentStatus, Player, PlayerPayment, Profile, Team } from "@/types/db";
import { shareText } from "@/lib/shareCompat";
import { teamLabel } from "@/lib/teamLabel";
import { confirmAsync, notify } from "@/lib/alertCompat";
import { Screen, Card, Eyebrow, Text, Button, Badge, Avatar, Field, IconChip, Divider, EmptyState } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

type TeamCoach = { team_id: string; coach_id: string };
type ScrollTarget = "addPlayer" | "roster";

export default function ClubManagement() {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [teamCoaches, setTeamCoaches] = useState<TeamCoach[]>([]);
  const [teamName, setTeamName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [season, setSeason] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [position, setPosition] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamNameError, setTeamNameError] = useState<string | undefined>();
  const [playerNameError, setPlayerNameError] = useState<string | undefined>();
  const [birthDateError, setBirthDateError] = useState<string | undefined>();
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [payments, setPayments] = useState<PlayerPayment[]>([]);
  const period = format(selectedMonth, "yyyy-MM");

  // Scroll-into-view for the team card's Add Player / Invite Parents buttons
  // (Task 31). Tapping either always selects the team, which is what these
  // buttons previously did and nothing else — a no-op when that team was
  // already selected. `pendingScroll` records which card to reveal; the
  // effect below waits two animation frames after the state update commits
  // so the target card (which may only just be mounting) has a settled
  // native layout before we measure it. Scrolling on the same tick would
  // race that layout and can land on the wrong offset.
  const scrollRef = useRef<ScrollView>(null);
  const addPlayerCardRef = useRef<View>(null);
  const rosterCardRef = useRef<View>(null);
  const [pendingScroll, setPendingScroll] = useState<ScrollTarget | null>(null);

  const scrollToCard = useCallback((targetRef: React.RefObject<View | null>) => {
    const scrollNode = scrollRef.current;
    const target = targetRef.current;
    const scrollHandle = scrollNode && findNodeHandle(scrollNode);
    if (!scrollNode || !target || !scrollHandle) return;
    target.measureLayout(
      scrollHandle,
      (_left, top) => scrollNode.scrollTo({ y: Math.max(top - space[4], 0), animated: true }),
      () => {}
    );
  }, []);

  useEffect(() => {
    if (!pendingScroll) return;
    const target = pendingScroll === "addPlayer" ? addPlayerCardRef : rosterCardRef;
    setPendingScroll(null);
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToCard(target));
    });
    return () => cancelAnimationFrame(raf1);
  }, [pendingScroll, scrollToCard]);

  const focusAddPlayer = (teamId: string) => {
    setSelectedTeamId(teamId);
    setPendingScroll("addPlayer");
  };

  const focusRoster = (teamId: string) => {
    setSelectedTeamId(teamId);
    setPendingScroll("roster");
  };

  const load = useCallback(async () => {
    if (!profile?.club_id || profile.role !== "director") return;
    const [teamResult, playerResult, staffResult, coachResult] = await Promise.all([
      supabase.from("teams").select("*").eq("club_id", profile.club_id).is("archived_at", null).order("name"),
      supabase.from("players").select("*, teams!inner(club_id)").eq("teams.club_id", profile.club_id).is("archived_at", null).order("full_name"),
      supabase.from("profiles").select("*").eq("club_id", profile.club_id).in("role", ["coach", "director"]).order("full_name"),
      supabase.from("team_coaches").select("team_id, coach_id"),
    ]);
    if (teamResult.error) console.error(teamResult.error.message);
    if (playerResult.error) console.error(playerResult.error.message);
    if (staffResult.error) console.error(staffResult.error.message);
    if (coachResult.error) console.error(coachResult.error.message);
    setTeams((teamResult.data as Team[]) ?? []);
    setPlayers((playerResult.data as unknown as Player[]) ?? []);
    setStaff((staffResult.data as Profile[]) ?? []);
    setTeamCoaches((coachResult.data as TeamCoach[]) ?? []);
    const nextTeams = (teamResult.data as Team[]) ?? [];
    setSelectedTeamId((current) => current && nextTeams.some((t) => t.id === current) ? current : nextTeams[0]?.id ?? null);
  }, [profile?.club_id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    (async () => {
      if (!profile?.club_id) return;
      const { data, error } = await supabase.from("player_payments").select("*").eq("club_id", profile.club_id).eq("period", period);
      if (error) return console.error("Failed to load payments:", error.message);
      setPayments((data as PlayerPayment[]) ?? []);
    })();
  }, [profile?.club_id, period]);

  const selectedTeam = useMemo(() => teams.find((t) => t.id === selectedTeamId) ?? null, [teams, selectedTeamId]);
  const selectedPlayers = players.filter((p) => p.team_id === selectedTeamId);

  const setupSteps = useMemo(
    () => [
      { label: "Create your first team", done: teams.length > 0 },
      { label: "Add players to a roster", done: players.length > 0 },
      { label: "Assign a coach to a team", done: teamCoaches.length > 0 },
      { label: "Link a parent to a player", done: players.some((p) => !!p.parent_id) },
    ],
    [teams, players, teamCoaches]
  );
  const completedSteps = setupSteps.filter((s) => s.done).length;

  if (profile?.role !== "director") {
    return (
      <Screen>
        <EmptyState icon="lock-closed" title="Directors only" body="Only club directors can manage club operations." />
      </Screen>
    );
  }

  const createTeam = async () => {
    if (!profile.club_id || !teamName.trim()) {
      setTeamNameError("Enter a team name first.");
      return;
    }
    setTeamNameError(undefined);
    setBusy(true);
    // Assign the creating director to their own team straight away. A director
    // who just made a team is its coach until they say otherwise — making them
    // pick themselves out of a one-name list is ceremony, and leaving it unset
    // shows "No coach assigned" on a team they personally created.
    const { data: created, error } = await supabase
      .from("teams")
      .insert({ club_id: profile.club_id, name: teamName.trim(), age_group: ageGroup.trim() || null, season: season.trim() || null })
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
    setBusy(false);
    if (error) return notify("Couldn't create team", error.message);
    setTeamName(""); setAgeGroup(""); setSeason(""); await load();
  };

  const addPlayer = async () => {
    if (!selectedTeamId || !playerName.trim()) {
      setPlayerNameError(!playerName.trim() ? "Enter the player's name." : "Choose a team first.");
      return;
    }
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setBirthDateError("Use YYYY-MM-DD or leave it blank.");
      return;
    }
    setPlayerNameError(undefined);
    setBirthDateError(undefined);
    setBusy(true);
    const { error } = await supabase.from("players").insert({ team_id: selectedTeamId, full_name: playerName.trim(), position: position.trim() || null, birth_date: birthDate || null });
    setBusy(false);
    if (error) return notify("Couldn't add player", error.message);
    setPlayerName(""); setPosition(""); setBirthDate(""); await load();
  };

  const toggleCoach = async (coachId: string) => {
    if (!selectedTeamId) return;
    const assigned = teamCoaches.some((tc) => tc.team_id === selectedTeamId && tc.coach_id === coachId);
    const { error } = await supabase.rpc("set_team_coach", { p_team_id: selectedTeamId, p_coach_id: coachId, p_assigned: !assigned });
    if (error) return notify("Couldn't update coach assignment", error.message);
    await load();
  };

  const createParentCode = async (player: Player) => {
    const { data, error } = await supabase.rpc("create_parent_link_code", { p_player_id: player.id });
    if (error) return notify("Couldn't create parent link", error.message);
    const code = String(data ?? "");
    if (Platform.OS === "web") {
      notify("Parent link code", `${player.full_name}: ${code}`);
      return;
    }
    Alert.alert("Parent link code", `${player.full_name}: ${code}`, [
      { text: "Close" },
      { text: "Share", onPress: () => shareText(`Link ${player.full_name} to your ClubHQ parent account with code: ${code}`) },
    ]);
  };

  const togglePayment = async (playerId: string) => {
    if (!profile?.club_id) return;
    const current: PaymentStatus = payments.find((p) => p.player_id === playerId)?.status ?? "unpaid";
    const nextStatus: PaymentStatus = current === "paid" ? "unpaid" : "paid";
    const { data, error } = await supabase
      .from("player_payments")
      .upsert(
        { player_id: playerId, club_id: profile.club_id, period, status: nextStatus, marked_by: profile.id, marked_at: new Date().toISOString() },
        { onConflict: "player_id,period" }
      )
      .select()
      .single();
    if (error) return notify("Couldn't update payment status", error.message);
    setPayments((prev) => [...prev.filter((p) => p.player_id !== playerId), data as PlayerPayment]);
  };

  const archivePlayer = async (player: Player) => {
    const ok = await confirmAsync(`Archive ${player.full_name}?`, "The player's history stays in the database but they disappear from the active roster.", "Archive");
    if (!ok) return;
    const { error } = await supabase.from("players").update({ archived_at: new Date().toISOString() }).eq("id", player.id);
    if (error) notify("Couldn't archive player", error.message);
    else await load();
  };

  const archiveTeam = async () => {
    if (!selectedTeam) return;
    const ok = await confirmAsync(`Archive ${teamLabel(selectedTeam)}?`, "Players and history stay intact. Move active players first if needed.", "Archive");
    if (!ok) return;
    const { error } = await supabase.from("teams").update({ archived_at: new Date().toISOString() }).eq("id", selectedTeam.id);
    if (error) notify("Couldn't archive team", error.message);
    else await load();
  };

  return (
    <Screen ref={scrollRef}>
      <Text role="h1">Run the club without opening Supabase</Text>
      <Text tone="secondary">Create teams, build rosters, assign coaches, and generate one-time parent link codes.</Text>

      <Card style={{ gap: space[3] }}>
        <View style={styles.headerRow}>
          <Eyebrow>Setup Progress</Eyebrow>
          <Text role="label" tone="brand">{completedSteps}/{setupSteps.length} Steps</Text>
        </View>
        <View style={styles.progressSegments}>
          {setupSteps.map((step, i) => (
            <View key={i} style={[styles.progressSegment, step.done && styles.progressSegmentDone]} />
          ))}
        </View>
        <View style={{ gap: space[2] }}>
          {setupSteps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Ionicons
                name={step.done ? "checkmark-circle" : "ellipse-outline"}
                size={16}
                color={step.done ? color.icon.success : color.icon.muted}
              />
              <Text tone={step.done ? "primary" : "secondary"} role="bodySm">{step.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ gap: space[3] }}>
        <Eyebrow>Active Teams</Eyebrow>
        {teams.length === 0 ? (
          <Card>
            <Text tone="secondary">No active teams yet — create one below.</Text>
          </Card>
        ) : (
          teams.map((team) => {
            const count = players.filter((p) => p.team_id === team.id).length;
            const coaches = staff.filter((s) => teamCoaches.some((tc) => tc.team_id === team.id && tc.coach_id === s.id));
            const isSelected = team.id === selectedTeamId;
            return (
              <Pressable key={team.id} onPress={() => setSelectedTeamId(team.id)}>
                <Card style={[styles.teamCard, isSelected && styles.teamCardActive]}>
                  <View style={styles.headerRow}>
                    <View style={{ flex: 1, gap: space[1] }}>
                      <Text role="h3">{team.name}</Text>
                      <Text tone="secondary" role="bodySm">{team.season || "No season"}</Text>
                    </View>
                    {team.age_group ? <Badge label={team.age_group} tone="brand" /> : null}
                  </View>

                  <Text tone="secondary" role="bodySm">
                    {count} {count === 1 ? "player" : "players"}
                  </Text>

                  {coaches.length > 0 ? (
                    <View style={styles.avatarRow}>
                      {coaches.map((c) => (
                        <Avatar key={c.id} uri={c.avatar_url} name={c.full_name} size={28} />
                      ))}
                    </View>
                  ) : (
                    <Text tone="tertiary" role="caption">No coach assigned</Text>
                  )}

                  <Divider />

                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Button label="Add Player" variant="secondary" size="sm" fullWidth onPress={() => focusAddPlayer(team.id)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button label="Invite Parents" variant="ghost" size="sm" fullWidth onPress={() => focusRoster(team.id)} />
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
      </View>

      <View style={styles.dashedContainer}>
        <Eyebrow>Create Team</Eyebrow>
        <Field
          placeholder="Team name, e.g. U10 Boys Red"
          value={teamName}
          onChangeText={(v) => {
            setTeamName(v);
            if (teamNameError) setTeamNameError(undefined);
          }}
          error={teamNameError}
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field placeholder="Age group" value={ageGroup} onChangeText={setAgeGroup} />
          </View>
          <View style={{ flex: 1 }}>
            <Field placeholder="Season" value={season} onChangeText={setSeason} />
          </View>
        </View>
        <Button label="Create Team" onPress={createTeam} disabled={busy} fullWidth />
      </View>

      {selectedTeam && (
        <>
          {/* A one-person club has nobody to assign, so the picker is pure
              ceremony — the director already coaches every team they make.
              The whole card appears only once a second coach joins the club;
              otherwise there is nothing to show, so nothing renders. */}
          {staff.length > 1 && (
            <Card style={{ gap: space[3] }}>
              <Eyebrow>Assigned Coaches — {teamLabel(selectedTeam)}</Eyebrow>
              {staff.map((coach) => {
                const assigned = teamCoaches.some((tc) => tc.team_id === selectedTeam.id && tc.coach_id === coach.id);
                return (
                  <Pressable key={coach.id} style={styles.coachRow} onPress={() => toggleCoach(coach.id)}>
                    <Avatar uri={coach.avatar_url} name={coach.full_name} size={32} />
                    <Text style={{ flex: 1 }}>{coach.full_name} · {coach.role}</Text>
                    <Ionicons
                      name={assigned ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={assigned ? color.icon.brand : color.icon.muted}
                    />
                  </Pressable>
                );
              })}
            </Card>
          )}

          <View ref={addPlayerCardRef} collapsable={false}>
            <Card style={{ gap: space[3] }}>
              <Eyebrow>Add Player to {teamLabel(selectedTeam)}</Eyebrow>
              <Field
                placeholder="Player full name"
                value={playerName}
                onChangeText={(v) => {
                  setPlayerName(v);
                  if (playerNameError) setPlayerNameError(undefined);
                }}
                error={playerNameError}
              />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field placeholder="Position" value={position} onChangeText={setPosition} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    placeholder="Birth date YYYY-MM-DD"
                    value={birthDate}
                    onChangeText={(v) => {
                      setBirthDate(v);
                      if (birthDateError) setBirthDateError(undefined);
                    }}
                    error={birthDateError}
                  />
                </View>
              </View>
              <Button label="Add Player" onPress={addPlayer} disabled={busy} fullWidth />
            </Card>
          </View>

          <View ref={rosterCardRef} collapsable={false}>
            <Card style={{ gap: space[3] }}>
              <Eyebrow>Roster ({selectedPlayers.length})</Eyebrow>
              {selectedPlayers.length === 0 ? (
                <EmptyState title="No players yet" body="Add players to this team to start building the roster." />
              ) : (
                selectedPlayers.map((player, i) => (
                  <React.Fragment key={player.id}>
                    {i > 0 && <Divider />}
                    <View style={styles.playerRow}>
                      <View style={{ flex: 1, gap: space[1] }}>
                        <Text role="h3">{player.full_name}</Text>
                        <Text tone="secondary" role="bodySm">
                          {player.position || "Position not set"}{player.parent_id ? " · Parent linked" : " · Parent not linked"}
                        </Text>
                      </View>
                      <Button label="Parent code" variant="secondary" size="sm" onPress={() => createParentCode(player)} />
                      <Pressable onPress={() => archivePlayer(player)} hitSlop={8}>
                        <Text role="caption" tone="danger">Archive</Text>
                      </Pressable>
                    </View>
                  </React.Fragment>
                ))
              )}
            </Card>
          </View>

          <Card style={{ gap: space[3] }}>
            <View style={styles.headerRow}>
              <Eyebrow>Training Fees</Eyebrow>
              <View style={styles.monthNav}>
                <Pressable onPress={() => setSelectedMonth((m) => addMonths(m, -1))} hitSlop={8}>
                  <Ionicons name="chevron-back" size={18} color={color.icon.brand} />
                </Pressable>
                <Text role="label">{format(selectedMonth, "MMM yyyy")}</Text>
                <Pressable onPress={() => setSelectedMonth((m) => addMonths(m, 1))} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={18} color={color.icon.brand} />
                </Pressable>
              </View>
            </View>
            <Text tone="secondary" role="bodySm">
              Tap Paid/Unpaid to record training fees for {format(selectedMonth, "MMMM")} — no money moves through the app.
            </Text>
            {selectedPlayers.length === 0 ? (
              <EmptyState title="No players yet" body="Add players to this team to start tracking training fees." />
            ) : (
              selectedPlayers.map((player, i) => {
                const status: PaymentStatus = payments.find((p) => p.player_id === player.id)?.status ?? "unpaid";
                const isPaid = status === "paid";
                return (
                  <React.Fragment key={player.id}>
                    {i > 0 && <Divider />}
                    <View style={styles.playerRow}>
                      <Text style={{ flex: 1 }}>{player.full_name}</Text>
                      <Pressable onPress={() => togglePayment(player.id)}>
                        <Badge label={isPaid ? "Paid" : "Unpaid"} tone={isPaid ? "success" : "danger"} />
                      </Pressable>
                    </View>
                  </React.Fragment>
                );
              })
            )}
          </Card>

          <Card style={{ gap: space[3] }}>
            <Eyebrow tone="danger">Archive Team</Eyebrow>
            <Button label="Archive team" variant="danger" fullWidth onPress={archiveTeam} />
          </Card>
        </>
      )}

      <View style={styles.infoCallout}>
        <IconChip name="information-circle" tone="brand" />
        <Text tone="secondary" style={{ flex: 1 }}>
          Archiving a team or player keeps their history intact — nothing is deleted, and you can always reference past rosters later.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", gap: space[3], alignItems: "center" },
  progressSegments: { flexDirection: "row", gap: space[2] },
  progressSegment: { flex: 1, height: space[2], borderRadius: radius.full, backgroundColor: color.bg.sunken },
  progressSegmentDone: { backgroundColor: color.bg.brand },
  stepRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  teamCard: { gap: space[3] },
  teamCardActive: { borderWidth: borderWidth.thin, borderColor: color.border.brand },
  avatarRow: { flexDirection: "row", gap: space[2] },
  coachRow: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[2] },
  playerRow: { flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: space[2], flexWrap: "wrap" },
  monthNav: { flexDirection: "row", alignItems: "center", gap: space[2] },
  dashedContainer: {
    borderWidth: borderWidth.thin,
    borderStyle: "dashed",
    borderColor: color.border.default,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[3],
  },
  infoCallout: {
    flexDirection: "row",
    gap: space[3],
    padding: space[4],
    borderRadius: radius.card,
    backgroundColor: color.bg.brandSubtle,
    alignItems: "flex-start",
  },
});
