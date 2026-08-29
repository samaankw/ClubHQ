import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { AttendanceRecord, AttendanceStatus, ClubEvent, EventRSVP, PaymentStatus, Player, PlayerPayment, RSVPStatus } from "@/types/db";
import { confirmAsync, notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { goBackOr } from "@/lib/navigation";
import { addEventToDeviceCalendar } from "@/lib/calendarExport";
import { Screen, Card, SpotlightCard, Text, Eyebrow, Button, Badge, Chip, Avatar, EmptyState } from "@/components/ui";
import { color, space } from "@/theme";

function audienceLabel(event: ClubEvent): string {
  const targets = event.event_players ?? [];
  const names = targets.map((t) => t.players.full_name).join(", ");
  if (targets.length && event.team_id) return `${event.teams ? teamLabel(event.teams) : "Team"} · ${names}`;
  if (targets.length) return names;
  if (event.team_id) return event.teams ? teamLabel(event.teams) : "Team";
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
  const { profile } = useAuth();
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

  if (loading || !event) {
    return (
      <Screen>
        <Text tone="secondary">Loading…</Text>
      </Screen>
    );
  }

  const paymentMonth = format(new Date(event.starts_at), "MMMM");
  const noResponse = Math.max(0, players.length - counts.yes - counts.no - counts.maybe);
  const sectionTitle = event.event_players?.length
    ? event.team_id
      ? "Attending Today"
      : event.event_players.length > 1 ? "Players" : "Player"
    : isStaff ? "Roster" : "Your Players";

  return (
    <Screen>
      <Stack.Screen options={{ title: event.title }} />

      <SpotlightCard style={{ gap: space[3] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" }}>
          <Eyebrow tone="onSpotlightMuted">{event.type.replace("_", " ")}</Eyebrow>
          <Badge label={audienceLabel(event)} tone="neutral" />
        </View>
        <Text role="h1" tone="onSpotlight">{event.title}</Text>
        <Text tone="onSpotlightMuted">{format(new Date(event.starts_at), "EEEE, MMMM d · h:mm a")}</Text>
        {event.location ? <Text tone="onSpotlightMuted">{event.location}</Text> : null}
        {event.notes ? <Text tone="onSpotlight">{event.notes}</Text> : null}

        <Button
          label={addingToCalendar ? "Adding…" : "Add to Calendar"}
          variant="secondary"
          size="sm"
          left={<Ionicons name="calendar" size={16} color={color.icon.default} />}
          onPress={handleAddToCalendar}
          disabled={addingToCalendar}
        />

        {canEdit && (
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <Button label="Edit" variant="secondary" fullWidth onPress={() => router.push(`/modals/create-event?eventId=${event.id}`)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Delete" variant="danger" fullWidth onPress={deleteEvent} />
            </View>
          </View>
        )}
      </SpotlightCard>

      {canEdit && hasFutureInSeries && (
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel this and all future sessions in this series" onPress={cancelRemainingSeries}>
          <Text role="bodySm" tone="danger" style={{ textAlign: "center", textDecorationLine: "underline" }}>
            Cancel this and all future sessions in this series
          </Text>
        </Pressable>
      )}

      {isStaff && (
        <Card style={{ gap: space[3] }}>
          <Eyebrow>Availability</Eyebrow>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            <Badge label={`${counts.yes} yes`} tone="success" />
            <Badge label={`${counts.no} no`} tone="danger" />
            <Badge label={`${counts.maybe} maybe`} tone="warning" />
            <Badge label={`${noResponse} no response`} tone="neutral" />
          </View>
        </Card>
      )}

      <Eyebrow>{sectionTitle}</Eyebrow>

      {players.length === 0 ? (
        <EmptyState title="No eligible players for this event." />
      ) : (
        players.map((player) => {
          const rsvp = rsvps.find((r) => r.player_id === player.id)?.status ?? "no_response";
          const att = attendance.find((r) => r.player_id === player.id)?.status;
          const isPaid = (payments.find((p) => p.player_id === player.id)?.status ?? "unpaid") === "paid";
          return (
            <Card key={player.id} style={{ gap: space[3] }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
                <Avatar name={player.full_name} uri={player.photo_url} />
                <Text role="h3">{player.full_name}</Text>
              </View>

              <View style={{ gap: space[2] }}>
                <Eyebrow>RSVP</Eyebrow>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
                  {RSVP_OPTIONS.map((option) => (
                    <Chip key={option.value} label={option.label} selected={rsvp === option.value} onPress={() => setRsvp(player.id, option.value)} />
                  ))}
                </View>
              </View>

              {isStaff && (
                <View style={{ gap: space[2] }}>
                  <Eyebrow>Attendance</Eyebrow>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
                    {ATTENDANCE_OPTIONS.map((option) => (
                      <Chip key={option.value} label={option.label} selected={att === option.value} onPress={() => setAttendanceStatus(player.id, option.value)} />
                    ))}
                  </View>
                </View>
              )}

              <View style={{ gap: space[2] }}>
                <Eyebrow>{`Payment (${paymentMonth})`}</Eyebrow>
                {isStaff ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isPaid ? "Mark unpaid" : "Mark paid"}
                    onPress={() => togglePayment(player.id)}
                    style={{ alignSelf: "flex-start" }}
                  >
                    <Badge label={isPaid ? "Paid" : "Unpaid"} tone={isPaid ? "success" : "danger"} />
                  </Pressable>
                ) : (
                  <Badge label={isPaid ? "Paid" : "Unpaid"} tone={isPaid ? "success" : "danger"} />
                )}
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
