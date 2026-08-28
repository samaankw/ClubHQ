import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { format, addMonths, startOfMonth } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { PaymentStatus, Player, PlayerPayment, Profile, Team } from "@/types/db";
import { shareText } from "@/lib/shareCompat";
import { teamLabel } from "@/lib/teamLabel";
import { confirmAsync, notify } from "@/lib/alertCompat";

type TeamCoach = { team_id: string; coach_id: string };

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
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [payments, setPayments] = useState<PlayerPayment[]>([]);
  const period = format(selectedMonth, "yyyy-MM");

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

  if (profile?.role !== "director") {
    return <View style={styles.center}><Text style={{ color: "#9A9DA3" }}>Only club directors can manage club operations.</Text></View>;
  }

  const createTeam = async () => {
    if (!profile.club_id || !teamName.trim()) return notify("Team name required", "Enter a team name first.");
    setBusy(true);
    const { error } = await supabase.from("teams").insert({ club_id: profile.club_id, name: teamName.trim(), age_group: ageGroup.trim() || null, season: season.trim() || null });
    setBusy(false);
    if (error) return notify("Couldn't create team", error.message);
    setTeamName(""); setAgeGroup(""); setSeason(""); await load();
  };

  const addPlayer = async () => {
    if (!selectedTeamId || !playerName.trim()) return notify("Missing info", "Choose a team and enter the player's name.");
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return notify("Birth date format", "Use YYYY-MM-DD or leave it blank.");
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.pageTitle}>Run the club without opening Supabase</Text>
      <Text style={styles.pageCopy}>Create teams, build rosters, assign coaches, and generate one-time parent link codes.</Text>

      <View style={styles.card}>
        <Text style={styles.heading}>Create Team</Text>
        <TextInput style={styles.input} placeholder="Team name, e.g. U10 Boys Red" value={teamName} onChangeText={setTeamName} />
        <View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Age group" value={ageGroup} onChangeText={setAgeGroup} /><TextInput style={[styles.input, styles.flex]} placeholder="Season" value={season} onChangeText={setSeason} /></View>
        <Pressable style={styles.primary} onPress={createTeam} disabled={busy}><Text style={styles.primaryText}>Create Team</Text></Pressable>
      </View>

      <Text style={styles.sectionLabel}>ACTIVE TEAMS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {teams.map((team) => <Pressable key={team.id} style={[styles.chip, selectedTeamId === team.id && styles.chipActive]} onPress={() => setSelectedTeamId(team.id)}><Text style={[styles.chipText, selectedTeamId === team.id && styles.chipTextActive]}>{teamLabel(team)}</Text></Pressable>)}
      </ScrollView>

      {selectedTeam && <>
        <View style={styles.card}>
          <View style={styles.headerRow}><View><Text style={styles.heading}>{teamLabel(selectedTeam)}</Text><Text style={styles.muted}>{selectedTeam.name} · {selectedTeam.season || "No season"}</Text></View><Pressable onPress={archiveTeam}><Text style={styles.dangerLink}>Archive team</Text></Pressable></View>
          <Text style={styles.subheading}>Assigned Coaches</Text>
          {staff.map((coach) => {
            const assigned = teamCoaches.some((tc) => tc.team_id === selectedTeam.id && tc.coach_id === coach.id);
            return <Pressable key={coach.id} style={styles.selectRow} onPress={() => toggleCoach(coach.id)}><View style={[styles.checkBox, assigned && styles.checkBoxOn]}>{assigned && <Text style={styles.check}>✓</Text>}</View><Text style={styles.selectText}>{coach.full_name} · {coach.role}</Text></Pressable>;
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Add Player to {teamLabel(selectedTeam)}</Text>
          <TextInput style={styles.input} placeholder="Player full name" value={playerName} onChangeText={setPlayerName} />
          <View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Position" value={position} onChangeText={setPosition} /><TextInput style={[styles.input, styles.flex]} placeholder="Birth date YYYY-MM-DD" value={birthDate} onChangeText={setBirthDate} /></View>
          <Pressable style={styles.primary} onPress={addPlayer} disabled={busy}><Text style={styles.primaryText}>Add Player</Text></Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.heading}>Roster ({selectedPlayers.length})</Text>
            <View style={styles.monthNav}>
              <Pressable onPress={() => setSelectedMonth((m) => addMonths(m, -1))}><Text style={styles.monthNavArrow}>‹</Text></Pressable>
              <Text style={styles.monthNavLabel}>{format(selectedMonth, "MMM yyyy")}</Text>
              <Pressable onPress={() => setSelectedMonth((m) => addMonths(m, 1))}><Text style={styles.monthNavArrow}>›</Text></Pressable>
            </View>
          </View>
          <Text style={[styles.muted, styles.paymentHint]}>Tap Paid/Unpaid to record training fees for {format(selectedMonth, "MMMM")} — no money moves through the app.</Text>
          {selectedPlayers.length === 0 ? <Text style={styles.muted}>No players on this team yet.</Text> : selectedPlayers.map((player) => {
            const status: PaymentStatus = payments.find((p) => p.player_id === player.id)?.status ?? "unpaid";
            const isPaid = status === "paid";
            return (
              <View key={player.id} style={styles.playerRow}>
                <View style={styles.flex}>
                  <Text style={styles.playerName}>{player.full_name}</Text>
                  <Text style={styles.muted}>{player.position || "Position not set"}{player.parent_id ? " · Parent linked" : " · Parent not linked"}</Text>
                </View>
                <Pressable style={[styles.paymentPill, isPaid && styles.paymentPillPaid]} onPress={() => togglePayment(player.id)}>
                  <Text style={[styles.paymentPillText, isPaid && styles.paymentPillTextPaid]}>{isPaid ? "Paid" : "Unpaid"}</Text>
                </Pressable>
                <Pressable style={styles.smallButton} onPress={() => createParentCode(player)}><Text style={styles.smallButtonText}>Parent code</Text></Pressable>
                <Pressable onPress={() => archivePlayer(player)}><Text style={styles.dangerLink}>Archive</Text></Pressable>
              </View>
            );
          })}
        </View>
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#0B0B0D", paddingBottom: 40 }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#0B0B0D" },
  pageTitle: { fontSize: 22, fontWeight: "800", color: "#F2F2F3" }, pageCopy: { color: "#9A9DA3", lineHeight: 19, marginTop: 5, marginBottom: 16 },
  card: { backgroundColor: "#141416", borderRadius: 14, padding: 16, marginBottom: 14 }, heading: { fontSize: 17, fontWeight: "800", color: "#0A6CFF", marginBottom: 10 }, subheading: { fontSize: 12, color: "#9A9DA3", fontWeight: "700", marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: "#242424", borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10, color: "#F2F2F3", backgroundColor: "#0B0B0D" }, row: { flexDirection: "row", gap: 8 }, flex: { flex: 1 }, primary: { backgroundColor: "#0A6CFF", borderRadius: 9, padding: 13, alignItems: "center" }, primaryText: { color: "#fff", fontWeight: "700" },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#9A9DA3", letterSpacing: .5, marginBottom: 8 }, chips: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingBottom: 14 }, chip: { borderWidth: 1, borderColor: "#0A6CFF", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18 }, chipActive: { backgroundColor: "#0A6CFF" }, chipText: { color: "#0A6CFF", fontWeight: "600" }, chipTextActive: { color: "#fff" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, muted: { color: "#9A9DA3", fontSize: 12 }, selectRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 7 }, checkBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: "#0A6CFF", alignItems: "center", justifyContent: "center" }, checkBoxOn: { backgroundColor: "#0A6CFF" }, check: { color: "#fff", fontWeight: "800", fontSize: 12 }, selectText: { color: "#F2F2F3", fontWeight: "600" },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#242424" }, playerName: { fontWeight: "700", color: "#F2F2F3" }, smallButton: { backgroundColor: "#17181B", borderRadius: 8, paddingVertical: 7, paddingHorizontal: 9 }, smallButtonText: { color: "#0A6CFF", fontSize: 11, fontWeight: "700" }, dangerLink: { color: "#FF6B6B", fontSize: 11, fontWeight: "700" },
  monthNav: { flexDirection: "row", alignItems: "center", gap: 10 },
  monthNavArrow: { color: "#0A6CFF", fontSize: 20, fontWeight: "800", paddingHorizontal: 4 },
  monthNavLabel: { color: "#F2F2F3", fontWeight: "700", fontSize: 13, minWidth: 68, textAlign: "center" },
  paymentHint: { marginBottom: 6 },
  paymentPill: { backgroundColor: "#3A1616", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  paymentPillPaid: { backgroundColor: "#173A22" },
  paymentPillText: { color: "#FF8A80", fontSize: 11, fontWeight: "700" },
  paymentPillTextPaid: { color: "#6FDB8F" },
});
