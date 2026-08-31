import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { AttendanceRecord, AttendanceStatus, ClubEvent, EventRSVP, PaymentStatus, Player, PlayerPayment, RSVPStatus } from "@/types/db";
import { confirmAsync, notify } from "@/lib/alertCompat";
import { groupLabel, OrgConfig } from "@/lib/orgConfig";
import { goBackOr } from "@/lib/navigation";
import { addEventToDeviceCalendar } from "@/lib/calendarExport";

function audienceLabel(event: ClubEvent, config: OrgConfig): string {
  const targets = event.event_players ?? [];
  const names = targets.map((t) => t.players.full_name).join(", ");
  if (targets.length && event.team_id) return `${event.teams ? groupLabel(event.teams) : config.labels.grouping} · ${names}`;
  if (targets.length) return names;
  if (event.team_id) return event.teams ? groupLabel(event.teams) : config.labels.grouping;
  return "Club-wide";
}

const RSVP_OPTIONS: { value: RSVPStatus; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "maybe", label: "Maybe" },
];
const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "excused", label: "Excused" },
];

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, orgConfig } = useAuth();
  const [event, setEvent] = useState<ClubEvent | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rsvps, setRsvps] = useState<EventRSVP[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payments, setPayments] = useState<PlayerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFutureInSeries, setHasFutureInSeries] = useState(false);
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const isStaff = profile?.role === "coach" || profile?.role === "director";
  const canEdit = !!event && (profile?.role === "director" || event.created_by === profile?.id);

  const handleAddToCalendar = async () => {
    if (!event) return;
    setAddingToCalendar(true);
    try {
      await addEventToDeviceCalendar(event);
      notify("Added to calendar", `"${event.title}" was added to your device calendar.`);
    } catch (e) {
      notify("Couldn't add to calendar", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingToCalendar(false);
    }
  };

  const deleteEvent = async () => {
    if (!event) return;
    const ok = await confirmAsync("Delete event?", `"${event.title}" will be removed for everyone, including any RSVPs. This can't be undone.`);
    if (!ok) return;
    const { data, error } = await supabase.from("events").delete().eq("id", event.id).select();
    if (error) return notify("Couldn't delete", error.message);
    if (!data || data.length === 0) return notify("Couldn't delete", "You don't have permission to delete this event.");
    goBackOr("/(tabs)/schedule?section=events");
  };

  const cancelRemainingSeries = async () => {
    if (!event?.series_id) return;
    const ok = await confirmAsync(
      "Cancel remaining sessions?",
      "This deletes this session and every later one in the series (past sessions are untouched). This can't be undone."
    );
    if (!ok) return;
    const { data, error } = await supabase
      .from("events")
      .delete()
      .eq("series_id", event.series_id)
      .gte("starts_at", event.starts_at)
      .select();
    if (error) return notify("Couldn't cancel sessions", error.message);
    if (!data || data.length === 0) return notify("Couldn't cancel sessions", "You don't have permission to delete these events.");
    goBackOr("/(tabs)/schedule?section=events");
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: eventData, error: eventError } = await supabase.from("events").select("*, teams(name, age_group), event_players(players(id, full_name))").eq("id", id).single();
    if (eventError || !eventData) {
      notify("Couldn't load event", eventError?.message ?? "Event not found.");
      setLoading(false);
      return;
    }
    const ev = eventData as ClubEvent;
    setEvent(ev);

    if (ev.series_id) {
      const { count } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("series_id", ev.series_id)
        .gt("starts_at", ev.starts_at);
      setHasFutureInSeries((count ?? 0) > 0);
    } else {
      setHasFutureInSeries(false);
    }

    const targetPlayerIds = (ev.event_players ?? []).map((t) => t.players.id);

    let playerQuery = supabase.from("players").select("*").is("archived_at", null);
    if (targetPlayerIds.length) {
      playerQuery = playerQuery.in("id", targetPlayerIds);
    } else if (isStaff) {
      if (ev.team_id) playerQuery = playerQuery.eq("team_id", ev.team_id);
      else {
        const { data: clubTeams } = await supabase.from("teams").select("id").eq("club_id", ev.club_id).is("archived_at", null);
        const teamIds = (clubTeams ?? []).map((t) => t.id);
        if (!teamIds.length) { setPlayers([]); setRsvps([]); setAttendance([]); setLoading(false); return; }
        playerQuery = playerQuery.in("team_id", teamIds);
      }
    } else if (profile?.id) {
      playerQuery = playerQuery.eq("parent_id", profile.id);
      if (ev.team_id) playerQuery = playerQuery.eq("team_id", ev.team_id);
    }

    // Payment status is keyed by the event's own month, not today's — so
    // marking payment on a session you're reviewing after the fact still
    // credits the month that session actually happened in.
    const period = format(new Date(ev.starts_at), "yyyy-MM");

    // No isStaff branch here — RLS itself scopes the result (staff see every
    // club row, a parent only their own children's), so this single query
    // is what actually lets a parent see their own payment status at all.
    const [{ data: playerData }, { data: rsvpData }, { data: attendanceData }, { data: paymentData }] = await Promise.all([
      playerQuery,
      supabase.from("event_rsvps").select("*").eq("event_id", id),
      supabase.from("attendance_records").select("*").eq("event_id", id),
      supabase.from("player_payments").select("*").eq("club_id", ev.club_id).eq("period", period),
    ]);
    setPlayers((playerData as Player[]) ?? []);
    setRsvps((rsvpData as EventRSVP[]) ?? []);
    setAttendance((attendanceData as AttendanceRecord[]) ?? []);
    setPayments((paymentData as PlayerPayment[]) ?? []);
    setLoading(false);
  }, [id, isStaff, profile?.id]);

  useEffect(() => { load(); }, [load]);

  const setRsvp = async (playerId: string, status: RSVPStatus) => {
    const previous = rsvps;
    setRsvps((current) => [...current.filter((r) => r.player_id !== playerId), { event_id: id!, player_id: playerId, status }]);
    const { error } = await supabase.from("event_rsvps").upsert({ event_id: id, player_id: playerId, status }, { onConflict: "event_id,player_id" });
    if (error) {
      setRsvps(previous);
      notify("Couldn't save RSVP", error.message);
    }
  };

  const setAttendanceStatus = async (playerId: string, status: AttendanceStatus) => {
    if (!profile?.id) return;
    const previous = attendance;
    const record: AttendanceRecord = { event_id: id!, player_id: playerId, status, marked_by: profile.id, marked_at: new Date().toISOString() };
    setAttendance((current) => [...current.filter((r) => r.player_id !== playerId), record]);
    const { error } = await supabase.from("attendance_records").upsert(
      { event_id: id, player_id: playerId, status, marked_by: profile.id, marked_at: record.marked_at },
      { onConflict: "event_id,player_id" }
    );
    if (error) {
      setAttendance(previous);
      notify("Couldn't save attendance", error.message);
    }
  };

  const togglePayment = async (playerId: string) => {
    if (!event || !profile?.id) return;
    const period = format(new Date(event.starts_at), "yyyy-MM");
    const current: PaymentStatus = payments.find((p) => p.player_id === playerId)?.status ?? "unpaid";
    const nextStatus: PaymentStatus = current === "paid" ? "unpaid" : "paid";
    const { data, error } = await supabase
      .from("player_payments")
      .upsert(
        { player_id: playerId, club_id: event.club_id, period, status: nextStatus, marked_by: profile.id, marked_at: new Date().toISOString() },
        { onConflict: "player_id,period" }
      )
      .select()
      .single();
    if (error) return notify("Couldn't update payment status", error.message);
    setPayments((prev) => [...prev.filter((p) => p.player_id !== playerId), data as PlayerPayment]);
  };

  const counts = useMemo(() => ({
    yes: rsvps.filter((r) => r.status === "yes").length,
    no: rsvps.filter((r) => r.status === "no").length,
    maybe: rsvps.filter((r) => r.status === "maybe").length,
  }), [rsvps]);

  if (loading || !event) return <View style={styles.center}><Text style={{ color: "#9A9DA3" }}>Loading…</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: event.title }} />
      <View style={styles.hero}>
        <View style={styles.typeRow}>
          <Text style={styles.type}>{event.type.replace("_", " ").toUpperCase()}</Text>
          <View style={styles.audienceTag}><Text style={styles.audienceTagText}>{audienceLabel(event, orgConfig)}</Text></View>
        </View>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.meta}>{format(new Date(event.starts_at), "EEEE, MMMM d · h:mm a")}</Text>
        {event.location ? <Text style={styles.meta}>{event.location}</Text> : null}
        {event.notes ? <Text style={styles.notes}>{event.notes}</Text> : null}

        <Pressable style={styles.calendarButton} onPress={handleAddToCalendar} disabled={addingToCalendar}>
          <Text style={styles.calendarButtonText}>{addingToCalendar ? "Adding…" : "📅 Add to Calendar"}</Text>
        </Pressable>

        {canEdit && (
          <View style={styles.heroActions}>
            <Pressable style={styles.heroButton} onPress={() => router.push(`/modals/create-event?eventId=${event.id}`)}>
              <Text style={styles.heroButtonText}>Edit</Text>
            </Pressable>
            <Pressable style={styles.heroButton} onPress={deleteEvent}>
              <Text style={[styles.heroButtonText, styles.heroButtonTextDanger]}>Delete</Text>
            </Pressable>
          </View>
        )}
        {canEdit && hasFutureInSeries && (
          <Pressable onPress={cancelRemainingSeries} style={styles.cancelSeriesLink}>
            <Text style={styles.cancelSeriesLinkText}>Cancel this and all future sessions in this series</Text>
          </Pressable>
        )}
      </View>

      {isStaff && (
        <View style={styles.summaryCard}>
          <Text style={styles.sectionLabel}>AVAILABILITY</Text>
          <Text style={styles.summaryText}>✅ {counts.yes} yes   ❌ {counts.no} no   🤔 {counts.maybe} maybe   · {Math.max(0, players.length - counts.yes - counts.no - counts.maybe)} no response</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        {event.event_players?.length
          ? event.team_id
            ? "Attending Today"
            : event.event_players.length > 1 ? "Players" : "Player"
          : isStaff ? "Players" : "Your Players"}
      </Text>
      {players.length === 0 ? <Text style={styles.muted}>No eligible players for this event.</Text> : players.map((player) => {
        const rsvp = rsvps.find((r) => r.player_id === player.id)?.status ?? "no_response";
        const att = attendance.find((r) => r.player_id === player.id)?.status;
        const isPaid = (payments.find((p) => p.player_id === player.id)?.status ?? "unpaid") === "paid";
        return (
          <View key={player.id} style={styles.card}>
            <Text style={styles.playerName}>{player.full_name}</Text>
            <Text style={styles.smallLabel}>RSVP</Text>
            <View style={styles.optionRow}>
              {RSVP_OPTIONS.map((option) => (
                <Pressable key={option.value} onPress={() => setRsvp(player.id, option.value)} style={[styles.chip, rsvp === option.value && styles.chipActive]}>
                  <Text style={[styles.chipText, rsvp === option.value && styles.chipTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            {isStaff && (
              <>
                <Text style={styles.smallLabel}>ATTENDANCE</Text>
                <View style={styles.optionRow}>
                  {ATTENDANCE_OPTIONS.map((option) => (
                    <Pressable key={option.value} onPress={() => setAttendanceStatus(player.id, option.value)} style={[styles.chip, att === option.value && styles.chipActive]}>
                      <Text style={[styles.chipText, att === option.value && styles.chipTextActive]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <Text style={styles.smallLabel}>PAYMENT ({format(new Date(event.starts_at), "MMMM")})</Text>
            {isStaff ? (
              <Pressable style={[styles.paymentPill, isPaid && styles.paymentPillPaid]} onPress={() => togglePayment(player.id)}>
                <Text style={[styles.paymentPillText, isPaid && styles.paymentPillTextPaid]}>{isPaid ? "Paid" : "Unpaid"}</Text>
              </Pressable>
            ) : (
              <View style={[styles.paymentPill, isPaid && styles.paymentPillPaid]}>
                <Text style={[styles.paymentPillText, isPaid && styles.paymentPillTextPaid]}>{isPaid ? "Paid" : "Unpaid"}</Text>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40, backgroundColor: "#0B0B0D" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B0B0D" },
  hero: { backgroundColor: "#0A6CFF", padding: 20, borderRadius: 14, marginBottom: 14 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  type: { color: "#CFE0F0", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  audienceTag: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  audienceTagText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  title: { color: "#fff", fontSize: 23, fontWeight: "800", marginTop: 4 },
  meta: { color: "#DCE8F2", marginTop: 6 },
  notes: { color: "#fff", marginTop: 12, lineHeight: 20 },
  calendarButton: { marginTop: 14, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  calendarButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  heroButton: { flex: 1, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  heroButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  heroButtonTextDanger: { color: "#FFD4D0" },
  cancelSeriesLink: { marginTop: 12, alignItems: "center" },
  cancelSeriesLinkText: { color: "#FFD4D0", fontSize: 12, fontWeight: "600", textDecorationLine: "underline" },
  summaryCard: { backgroundColor: "#141416", padding: 14, borderRadius: 12, marginBottom: 14 },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9A9DA3", letterSpacing: 0.5 },
  summaryText: { marginTop: 6, color: "#B5B8BE", fontWeight: "600" },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginVertical: 10, color: "#F2F2F3" },
  card: { backgroundColor: "#141416", padding: 14, borderRadius: 12, marginBottom: 10 },
  playerName: { fontSize: 16, fontWeight: "800", color: "#F2F2F3" },
  smallLabel: { fontSize: 10, fontWeight: "800", color: "#6B6F76", marginTop: 12, marginBottom: 6 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderWidth: 1, borderColor: "#3A3B3E", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16 },
  chipActive: { backgroundColor: "#0A6CFF", borderColor: "#0A6CFF" },
  chipText: { color: "#9A9DA3", fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  muted: { color: "#6B6F76", textAlign: "center", marginTop: 20 },
  paymentPill: { alignSelf: "flex-start", backgroundColor: "#3A1616", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  paymentPillPaid: { backgroundColor: "#173A22" },
  paymentPillText: { color: "#FF8A80", fontSize: 12, fontWeight: "700" },
  paymentPillTextPaid: { color: "#6FDB8F" },
});
