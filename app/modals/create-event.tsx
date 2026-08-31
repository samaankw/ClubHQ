import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { ClubEvent, EventType, Team } from "@/types/db";
import { notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";

interface PlayerOption {
  id: string;
  full_name: string;
  teams?: { age_group: string | null } | null;
}

const TYPES: { key: EventType; label: string }[] = [
  { key: "practice", label: "Practice" },
  { key: "game", label: "Game" },
  { key: "tournament", label: "Tournament" },
  { key: "club_event", label: "Club Event" },
];

type AudienceMode = "club" | "team" | "player";

export default function CreateEvent() {
  const { profile } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const isEditing = !!eventId;
  // Holds the specific players an edited event already had until the
  // relevant roster/player list finishes loading and can apply it — cleared
  // right after, so switching teams afterward still defaults to "everyone".
  const presetPlayerIdsRef = useRef<string[] | null>(null);
  const [type, setType] = useState<EventType>("practice");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [hourStr, setHourStr] = useState("");
  const [minuteStr, setMinuteStr] = useState("");
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("AM");
  const [notes, setNotes] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>(profile?.role === "director" ? "club" : "team");
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  // Who from the selected training group is actually attending — defaults to
  // everyone, since a coach not showing up doesn't mean the whole group is
  // out. Unchecking someone removes just them from this event's roster.
  const [teamRoster, setTeamRoster] = useState<PlayerOption[]>([]);
  const [attendingIds, setAttendingIds] = useState<string[]>([]);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeksStr, setRepeatWeeksStr] = useState("8");
  const [submitting, setSubmitting] = useState(false);
  // Defaults on: a coach who moved a session should have to opt *out* of
  // telling families, not remember to opt in.
  const [notifyChange, setNotifyChange] = useState(true);
  // What the event looked like when the edit form opened, so we can tell
  // whether this save actually moves the session or just fixes a typo in the
  // notes — the notify toggle is meaningless in the second case.
  const originalRef = useRef<{ startsAt: string; location: string } | null>(null);

  // Shared by the submit handler and the "notify families" toggle, which
  // only appears once the form actually differs from the saved event.
  const composeStartsAt = (): Date | null => {
    if (!dateStr || !hourStr || !minuteStr) return null;
    const hour12 = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    if (isNaN(hour12) || hour12 < 1 || hour12 > 12 || isNaN(minute) || minute < 0 || minute > 59) return null;
    const hour24 = (hour12 % 12) + (meridiem === "PM" ? 12 : 0);
    const d = new Date(`${dateStr}T${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
    return isNaN(d.getTime()) ? null : d;
  };

  const scheduleChanged = useMemo(() => {
    const original = originalRef.current;
    if (!isEditing || !original) return false;
    const next = composeStartsAt();
    const timeChanged = !!next && next.getTime() !== new Date(original.startsAt).getTime();
    return timeChanged || location.trim() !== original.location;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, dateStr, hourStr, minuteStr, meridiem, location]);

  const togglePlayer = (id: string) => {
    setSelectedPlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const toggleAttending = (id: string) => {
    setAttendingIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*, event_players(players(id))")
        .eq("id", eventId)
        .single();
      if (error || !data) {
        notify("Couldn't load event", error?.message ?? "Event not found.");
        return;
      }
      const ev = data as ClubEvent;
      setType(ev.type);
      setTitle(ev.title);
      setLocation(ev.location ?? "");
      const startsAt = new Date(ev.starts_at);
      setDateStr(format(startsAt, "yyyy-MM-dd"));
      setHourStr(format(startsAt, "h"));
      setMinuteStr(format(startsAt, "mm"));
      setMeridiem(format(startsAt, "a") as "AM" | "PM");
      setNotes(ev.notes ?? "");
      originalRef.current = { startsAt: ev.starts_at, location: (ev.location ?? "").trim() };

      const targetIds = (ev.event_players ?? []).map((t) => t.players.id);
      if (ev.team_id) {
        setAudienceMode("team");
        setTeamId(ev.team_id);
        presetPlayerIdsRef.current = targetIds.length ? targetIds : null;
      } else if (targetIds.length) {
        setAudienceMode("player");
        setSelectedPlayerIds(targetIds);
      } else {
        setAudienceMode("club");
      }
    })();
  }, [eventId]);

  useEffect(() => {
    (async () => {
      if (!profile?.club_id) return;
      let query = supabase.from("teams").select("*").eq("club_id", profile.club_id).is("archived_at", null).order("name");
      if (profile.role === "coach") {
        const { data: assignments } = await supabase.from("team_coaches").select("team_id").eq("coach_id", profile.id);
        const ids = (assignments ?? []).map((a) => a.team_id);
        if (!ids.length) { setTeams([]); return; }
        query = query.in("id", ids);
      }
      const { data } = await query;
      const next = (data as Team[]) ?? [];
      setTeams(next);
      if (!isEditing && profile.role === "coach" && next.length) setTeamId(next[0].id);
    })();
  }, [profile?.club_id, profile?.id, profile?.role]);

  // Training-group roster, so the coach can uncheck anyone not training that
  // day instead of the event always assuming the whole group showed up.
  useEffect(() => {
    (async () => {
      if (audienceMode !== "team" || !teamId) { setTeamRoster([]); setAttendingIds([]); return; }
      const { data } = await supabase
        .from("players")
        .select("id, full_name")
        .eq("team_id", teamId)
        .is("archived_at", null)
        .order("full_name");
      const next = (data as PlayerOption[]) ?? [];
      setTeamRoster(next);
      if (presetPlayerIdsRef.current) {
        setAttendingIds(presetPlayerIdsRef.current.filter((id) => next.some((p) => p.id === id)));
        presetPlayerIdsRef.current = null;
      } else {
        setAttendingIds(next.map((p) => p.id));
      }
    })();
  }, [audienceMode, teamId]);

  // "Select Players" list — pulled from every team the coach/director has
  // access to (not just one), so a mixed-age session (say a U9 and a U12
  // training together) can pull players from across different groups in one
  // pick. age_group is embedded so players with similar names, or from
  // groups the coach doesn't usually see together, are still easy to tell apart.
  useEffect(() => {
    (async () => {
      if (audienceMode !== "player") return;
      const teamIds = teams.map((t) => t.id);
      if (!teamIds.length) { setPlayers([]); return; }
      const { data } = await supabase
        .from("players")
        .select("id, full_name, teams(age_group)")
        .in("team_id", teamIds)
        .is("archived_at", null)
        .order("full_name");
      setPlayers((data as unknown as PlayerOption[]) ?? []);
    })();
  }, [audienceMode, teams]);

  const handleSubmit = async () => {
    if (!title.trim() || !dateStr || !hourStr || !minuteStr) return notify("Missing info", "Please add a title, date (YYYY-MM-DD), and a time.");
    if (!profile?.club_id) return notify("No club found", "Your profile isn't linked to a club yet.");
    if (audienceMode === "team" && !teamId) return notify("Team required", "Pick a training group for this event.");
    if (audienceMode === "team" && teamRoster.length > 0 && !attendingIds.length) return notify("No one attending", "Pick at least one player training that day, or switch groups.");
    if (audienceMode === "player" && !selectedPlayerIds.length) return notify("Player required", "Pick who this session is for.");

    const startsAt = composeStartsAt();
    if (!startsAt) {
      return notify("Invalid time", "Use YYYY-MM-DD for the date, an hour from 1–12, and minutes 0–59.");
    }

    // Only attach an explicit player list when it's a *subset* of the group
    // (someone's out that day) or a private session — a full group roster
    // is represented by team_id alone, same as before.
    const isPartialTeam = audienceMode === "team" && attendingIds.length < teamRoster.length;
    const playerIds = audienceMode === "player" ? selectedPlayerIds : isPartialTeam ? attendingIds : null;

    const occurrenceCount = !isEditing && repeatWeekly ? parseInt(repeatWeeksStr, 10) : 1;
    if (!isEditing && repeatWeekly && (isNaN(occurrenceCount) || occurrenceCount < 2 || occurrenceCount > 52)) {
      return notify("Invalid repeat count", "Enter a number of weeks between 2 and 52.");
    }

    setSubmitting(true);
    // Player-targeted sessions (one or more specific players, possibly
    // training together) go through these RPCs so "only a director can
    // create a true club-wide event" still holds even though the event row
    // and its player targets are separate inserts under the hood.
    if (isEditing) {
      const { error } = await supabase.rpc("update_targeted_event", {
        p_event_id: eventId,
        p_type: type,
        p_title: title.trim(),
        p_location: location.trim() || null,
        p_starts_at: startsAt.toISOString(),
        p_notes: notes.trim() || null,
        p_team_id: audienceMode === "team" ? teamId : null,
        p_player_ids: playerIds,
        // Read server-side by announce_event_change() (migration 0033), which
        // writes the "New time / New location" notice into the feed. Only
        // meaningful when the time or location actually moved.
        p_notify: notifyChange,
      });
      setSubmitting(false);
      if (error) return notify("Couldn't save changes", error.message);

      // Fire-and-forget, same as on create. The push and the in-feed notice
      // are deliberately two mechanisms: the push is the interrupt, the
      // announcement is the record for whoever missed it. Suppressing the
      // notice suppresses both, or the coach would silence the feed and still
      // ping everyone's phone.
      if (!scheduleChanged || notifyChange) {
        supabase.functions.invoke("send-event-push", { body: { eventId, isUpdate: true } }).catch((err) => {
          console.warn("Event update push notification failed to send:", err);
        });
      }

      goBackOr(`/event/${eventId}`);
      return;
    }

    // Weekly repeats create one independent row per occurrence, sharing a
    // series_id so "cancel remaining sessions" (on the event detail page)
    // can find them later — same day/time each week is the only pattern
    // this club actually needs, not a full RRULE.
    const createOccurrence = (startsAtIso: string, seriesIdArg: string | null) =>
      supabase.rpc("create_targeted_event", {
        p_club_id: profile.club_id,
        p_type: type,
        p_title: title.trim(),
        p_location: location.trim() || null,
        p_starts_at: startsAtIso,
        p_notes: notes.trim() || null,
        p_team_id: audienceMode === "team" ? teamId : null,
        p_player_ids: playerIds,
        p_series_id: seriesIdArg,
      });

    let seriesId: string | null = null;
    let firstEventId: string | null = null;
    for (let i = 0; i < occurrenceCount; i++) {
      const occurrenceStart = new Date(startsAt.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const { data: newEventId, error } = await createOccurrence(occurrenceStart.toISOString(), seriesId);
      if (error) {
        setSubmitting(false);
        return notify(
          i === 0 ? "Couldn't create event" : "Some sessions couldn't be created",
          i === 0 ? error.message : `Created ${i} of ${occurrenceCount} sessions before hitting an error: ${error.message}`
        );
      }
      if (i === 0) {
        seriesId = newEventId;
        firstEventId = newEventId;
      }
    }
    setSubmitting(false);

    // Fire-and-forget, same as announcements — the event is already saved
    // either way, so a push hiccup shouldn't block the coach or scare them
    // with an error for something non-critical. Only the first occurrence
    // notifies, so a 12-week series doesn't send 12 pushes.
    if (firstEventId) {
      supabase.functions.invoke("send-event-push", { body: { eventId: firstEventId } }).catch((err) => {
        console.warn("Event push notification failed to send:", err);
      });
    }

    goBackOr("/(tabs)/schedule?section=events");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen
        options={{
          title: isEditing ? "Edit Event" : "New Event",
          headerLeft: () => <ModalBackButton onPress={() => goBackOr(isEditing ? `/event/${eventId}` : "/(tabs)/schedule?section=events")} />,
        }}
      />
      <Text style={styles.label}>EVENT TYPE</Text>
      <View style={styles.typeRow}>
        {TYPES.map((t) => <Pressable key={t.key} style={[styles.typeChip, type === t.key && styles.typeChipActive]} onPress={() => setType(t.key)}><Text style={[styles.typeChipText, type === t.key && styles.typeChipTextActive]}>{t.label}</Text></Pressable>)}
      </View>

      <Text style={styles.label}>AUDIENCE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={styles.chipRow}>
        {profile?.role === "director" && (
          <Pressable style={[styles.teamChip, audienceMode === "club" && styles.teamChipActive]} onPress={() => setAudienceMode("club")}>
            <Text style={[styles.teamChipText, audienceMode === "club" && styles.teamChipTextActive]}>Club-wide</Text>
          </Pressable>
        )}
        <Pressable style={[styles.teamChip, audienceMode === "team" && styles.teamChipActive]} onPress={() => setAudienceMode("team")}>
          <Text style={[styles.teamChipText, audienceMode === "team" && styles.teamChipTextActive]}>Training Group</Text>
        </Pressable>
        <Pressable style={[styles.teamChip, audienceMode === "player" && styles.teamChipActive]} onPress={() => setAudienceMode("player")}>
          <Text style={[styles.teamChipText, audienceMode === "player" && styles.teamChipTextActive]}>Select Players</Text>
        </Pressable>
      </ScrollView>

      {audienceMode === "team" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={styles.chipRow}>
          {teams.map((team) => (
            <Pressable key={team.id} style={[styles.teamChip, teamId === team.id && styles.teamChipActive]} onPress={() => setTeamId(team.id)}>
              <Text style={[styles.teamChipText, teamId === team.id && styles.teamChipTextActive]}>{teamLabel(team)}</Text>
            </Pressable>
          ))}
          {!teams.length && <Text style={styles.mutedNote}>No training groups assigned yet.</Text>}
        </ScrollView>
      )}

      {audienceMode === "team" && teamId && teamRoster.length > 0 && (
        <View style={styles.rosterCard}>
          <View style={styles.rosterHeaderRow}>
            <Text style={styles.rosterHeading}>Who's training today? ({attendingIds.length}/{teamRoster.length})</Text>
            <Pressable onPress={() => setAttendingIds(attendingIds.length === teamRoster.length ? [] : teamRoster.map((p) => p.id))}>
              <Text style={styles.rosterToggleAll}>{attendingIds.length === teamRoster.length ? "Clear all" : "Select all"}</Text>
            </Pressable>
          </View>
          {teamRoster.map((p) => {
            const isAttending = attendingIds.includes(p.id);
            return (
              <Pressable key={p.id} style={styles.rosterRow} onPress={() => toggleAttending(p.id)}>
                <View style={[styles.checkBox, isAttending && styles.checkBoxOn]}>{isAttending && <Text style={styles.checkMark}>✓</Text>}</View>
                <Text style={styles.rosterName}>{p.full_name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {audienceMode === "player" && (
        <View style={styles.rosterCard}>
          <Text style={styles.rosterHeading}>Pick anyone, from any group ({selectedPlayerIds.length} selected)</Text>
          {players.map((p) => {
            const isSelected = selectedPlayerIds.includes(p.id);
            return (
              <Pressable key={p.id} style={styles.rosterRow} onPress={() => togglePlayer(p.id)}>
                <View style={[styles.checkBox, isSelected && styles.checkBoxOn]}>{isSelected && <Text style={styles.checkMark}>✓</Text>}</View>
                <Text style={styles.rosterName}>{p.full_name}</Text>
                {p.teams?.age_group ? <Text style={styles.rosterAgeGroup}>{p.teams.age_group}</Text> : null}
              </Pressable>
            );
          })}
          {!players.length && <Text style={styles.mutedNote}>No players found on your teams yet.</Text>}
        </View>
      )}

      <TextInput style={styles.input} placeholder="Title (e.g. U10 vs Northside FC)" placeholderTextColor="#6B6F76" value={title} onChangeText={setTitle} />
      <TextInput style={styles.input} placeholder="Location" placeholderTextColor="#6B6F76" value={location} onChangeText={setLocation} />
      <TextInput style={styles.input} placeholder="Date (YYYY-MM-DD)" placeholderTextColor="#6B6F76" value={dateStr} onChangeText={setDateStr} />
      <View style={styles.timeRow}>
        <TextInput
          style={[styles.input, styles.timeInput]}
          placeholder="3"
          placeholderTextColor="#6B6F76"
          value={hourStr}
          onChangeText={setHourStr}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={styles.timeColon}>:</Text>
        <TextInput
          style={[styles.input, styles.timeInput]}
          placeholder="00"
          placeholderTextColor="#6B6F76"
          value={minuteStr}
          onChangeText={setMinuteStr}
          keyboardType="number-pad"
          maxLength={2}
        />
        <View style={styles.meridiemGroup}>
          <Pressable style={[styles.meridiemChip, meridiem === "AM" && styles.meridiemChipActive]} onPress={() => setMeridiem("AM")}>
            <Text style={[styles.meridiemChipText, meridiem === "AM" && styles.meridiemChipTextActive]}>AM</Text>
          </Pressable>
          <Pressable style={[styles.meridiemChip, meridiem === "PM" && styles.meridiemChipActive]} onPress={() => setMeridiem("PM")}>
            <Text style={[styles.meridiemChipText, meridiem === "PM" && styles.meridiemChipTextActive]}>PM</Text>
          </Pressable>
        </View>
      </View>

      {!isEditing && (
        <View style={styles.rosterCard}>
          <Pressable style={styles.repeatRow} onPress={() => setRepeatWeekly((v) => !v)}>
            <View style={[styles.checkBox, repeatWeekly && styles.checkBoxOn]}>{repeatWeekly && <Text style={styles.checkMark}>✓</Text>}</View>
            <Text style={styles.rosterName}>Repeats weekly</Text>
          </Pressable>
          {repeatWeekly && (
            <View style={styles.repeatWeeksRow}>
              <Text style={styles.mutedNote}>Same day and time, for</Text>
              <TextInput
                style={[styles.input, styles.repeatWeeksInput]}
                value={repeatWeeksStr}
                onChangeText={setRepeatWeeksStr}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.mutedNote}>weeks</Text>
            </View>
          )}
        </View>
      )}

      {/* Only surfaced once the time or location actually differs from the
          saved event — a coach fixing a typo in the notes has no reason to
          think about notifying anyone. */}
      {scheduleChanged && (
        <View style={styles.rosterCard}>
          <Pressable style={styles.repeatRow} onPress={() => setNotifyChange((v) => !v)}>
            <View style={[styles.checkBox, notifyChange && styles.checkBoxOn]}>
              {notifyChange && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.rosterName}>Let families know what changed</Text>
          </Pressable>
          <Text style={styles.mutedNote}>
            {notifyChange
              ? "Posts the old and new details to the schedule feed and sends a notification."
              : "This change will be saved silently. Families won't be told."}
          </Text>
        </View>
      )}

      <TextInput style={[styles.input, styles.textarea]} placeholder="Notes (optional)" placeholderTextColor="#6B6F76" value={notes} onChangeText={setNotes} multiline />
      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? (isEditing ? "Saving…" : "Creating…") : isEditing ? "Save Changes" : "Add to Schedule"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#0B0B0D", flexGrow: 1 },
  label: { fontSize: 11, fontWeight: "800", color: "#9A9DA3", letterSpacing: .5, marginBottom: 8 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  typeChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: "#0A6CFF" },
  typeChipActive: { backgroundColor: "#0A6CFF" }, typeChipText: { color: "#0A6CFF", fontWeight: "600" }, typeChipTextActive: { color: "#fff" },
  chipRow: { flexDirection: "row", alignItems: "flex-start" },
  teamChip: { marginRight: 8, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 18, backgroundColor: "#17181B" }, teamChipActive: { backgroundColor: "#0A6CFF" }, teamChipText: { color: "#9A9DA3", fontWeight: "600" }, teamChipTextActive: { color: "#fff" },
  mutedNote: { color: "#6B6F76", fontSize: 13, marginTop: 6 },
  rosterCard: { backgroundColor: "#141416", borderRadius: 12, padding: 14, marginBottom: 14 },
  rosterHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  rosterHeading: { fontSize: 12, fontWeight: "800", color: "#9A9DA3" },
  rosterToggleAll: { fontSize: 13, fontWeight: "700", color: "#0A6CFF" },
  rosterRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  rosterName: { color: "#F2F2F3", fontWeight: "600", fontSize: 14, flex: 1 },
  rosterAgeGroup: { color: "#0A6CFF", fontWeight: "700", fontSize: 11, backgroundColor: "#17181B", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  checkBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: "#0A6CFF", alignItems: "center", justifyContent: "center" },
  checkBoxOn: { backgroundColor: "#0A6CFF" },
  checkMark: { color: "#fff", fontWeight: "800", fontSize: 12 },
  input: { borderWidth: 1, borderColor: "#242424", borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 16, color: "#F2F2F3", backgroundColor: "#141416" },
  textarea: { height: 90, textAlignVertical: "top" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  timeInput: { flex: 1, marginBottom: 0, textAlign: "center" },
  timeColon: { color: "#F2F2F3", fontSize: 18, fontWeight: "700" },
  meridiemGroup: { flexDirection: "row", borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "#242424" },
  meridiemChip: { paddingVertical: 14, paddingHorizontal: 14, backgroundColor: "#141416" },
  meridiemChipActive: { backgroundColor: "#0A6CFF" },
  meridiemChipText: { color: "#9A9DA3", fontWeight: "700", fontSize: 13 },
  meridiemChipTextActive: { color: "#fff" },
  repeatRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  repeatWeeksRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  repeatWeeksInput: { width: 56, marginBottom: 0, textAlign: "center", paddingVertical: 10 },
  button: { backgroundColor: "#0A6CFF", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
