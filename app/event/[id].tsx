import React, { useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { AttendanceRecord, AttendanceStatus, ClubEvent, EventRSVP, PaymentStatus, Player, PlayerPayment, RSVPStatus } from "@/types/db";
import { useVocab } from "@/lib/vocab";
import type { VocabSet } from "@/lib/vocab";
import { chooseAsync, confirmAsync, notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { goBackOr } from "@/lib/navigation";
import { addEventToDeviceCalendar } from "@/lib/calendarExport";
import { useAsyncData } from "@/lib/asyncData";
import ListState from "@/components/ListState";
import { Screen, Card, SpotlightCard, Text, Eyebrow, Button, Badge, Chip, Avatar, EmptyState } from "@/components/ui";
import { color, space } from "@/theme";

function audienceLabel(event: ClubEvent, vocab: VocabSet): string {
  const targets = event.event_players ?? [];
  const names = targets.map((t) => t.players.full_name).join(", ");
  const groupWord = vocab.group?.singular ?? "Team";
  if (targets.length && event.team_id) return `${event.teams ? teamLabel(event.teams) : groupWord} · ${names}`;
  if (targets.length) return names;
  if (event.team_id) return event.teams ? teamLabel(event.teams) : groupWord;
  return `${vocab.organization.singular}-wide`;
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

interface EventDetailData {
  event: ClubEvent;
  players: Player[];
  rsvps: EventRSVP[];
  attendance: AttendanceRecord[];
  payments: PlayerPayment[];
  hasFutureInSeries: boolean;
}

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const vocab = useVocab();
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const isStaff = profile?.role === "coach" || profile?.role === "director";

  const {
    data,
    loading,
    error,
    retry: load,
    setData,
  } = useAsyncData<EventDetailData | null>(
    async () => {
      if (!id) return null;
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("*, teams(name, age_group), event_players(players(id, full_name))")
        .eq("id", id)
        .single();
      if (eventError) throw eventError;
      if (!eventData) throw { message: "Event not found." };
      const ev = eventData as ClubEvent;

      let hasFutureInSeries = false;
      if (ev.series_id) {
        const { count, error: countError } = await supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("series_id", ev.series_id)
          .gt("starts_at", ev.starts_at);
        if (countError) throw countError;
        hasFutureInSeries = (count ?? 0) > 0;
      }

      const targetPlayerIds = (ev.event_players ?? []).map((t) => t.players.id);

      let playerQuery = supabase.from("players").select("*").is("archived_at", null);
      if (targetPlayerIds.length) {
        playerQuery = playerQuery.in("id", targetPlayerIds);
      } else if (isStaff) {
        if (ev.team_id) {
          playerQuery = playerQuery.eq("team_id", ev.team_id);
        } else {
          const { data: clubTeams, error: clubTeamsError } = await supabase
            .from("teams")
            .select("id")
            .eq("club_id", ev.club_id)
            .is("archived_at", null);
          if (clubTeamsError) throw clubTeamsError;
          const teamIds = (clubTeams ?? []).map((t) => t.id);
          if (!teamIds.length) {
            return { event: ev, players: [], rsvps: [], attendance: [], payments: [], hasFutureInSeries };
          }
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
      const [playerResult, rsvpResult, attendanceResult, paymentResult] = await Promise.all([
        playerQuery,
        supabase.from("event_rsvps").select("*").eq("event_id", id),
        supabase.from("attendance_records").select("*").eq("event_id", id),
        supabase.from("player_payments").select("*").eq("club_id", ev.club_id).eq("period", period),
      ]);
      if (playerResult.error) throw playerResult.error;
      if (rsvpResult.error) throw rsvpResult.error;
      if (attendanceResult.error) throw attendanceResult.error;
      if (paymentResult.error) throw paymentResult.error;

      return {
        event: ev,
        players: (playerResult.data as Player[]) ?? [],
        rsvps: (rsvpResult.data as EventRSVP[]) ?? [],
        attendance: (attendanceResult.data as AttendanceRecord[]) ?? [],
        payments: (paymentResult.data as PlayerPayment[]) ?? [],
        hasFutureInSeries,
      };
    },
    [id, isStaff, profile?.id],
    null,
  );

  const rsvps = data?.rsvps ?? [];
  const counts = useMemo(
    () => ({
      yes: rsvps.filter((r) => r.status === "yes").length,
      no: rsvps.filter((r) => r.status === "no").length,
      maybe: rsvps.filter((r) => r.status === "maybe").length,
    }),
    [rsvps],
  );

  if (loading || error || !data) {
    return (
      <Screen>
        <ListState loading={loading} error={error} isEmpty={!loading && !error} onRetry={load} emptyTitle="Event not found." />
      </Screen>
    );
  }

  const { event, players, attendance, payments, hasFutureInSeries } = data;
  const canEdit = profile?.role === "director" || event.created_by === profile?.id;
  const isUpcoming = new Date(event.starts_at).getTime() > Date.now();

  const handleAddToCalendar = async () => {
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

  // The delete RPCs (0035) return the ids of the cancellation notices the
  // trigger wrote. Fire-and-forget, matching every other push call site: a
  // failed notification must not make a completed deletion look failed.
  const pushCancellationNotices = (announcementIds: string[] | null) => {
    for (const announcementId of announcementIds ?? []) {
      supabase.functions.invoke("send-announcement-push", { body: { announcementId } }).catch((err) => {
        console.warn("cancellation push failed", err);
      });
    }
  };

  const deleteEvent = async () => {
    const detail = `"${event.title}" will be removed for everyone, including any RSVPs. This can't be undone.`;

    // Deleting a session that already happened is record-keeping; the
    // trigger skips it too, so offering a notification choice would be a lie.
    let notifyFamilies = false;
    if (isUpcoming) {
      const choice = await chooseAsync("Delete session?", detail, [
        { key: "notify", label: "Delete and notify families", destructive: true },
        { key: "quiet", label: "Delete without notifying", destructive: true },
      ]);
      if (!choice) return;
      notifyFamilies = choice === "notify";
    } else if (!(await confirmAsync("Delete session?", detail))) {
      return;
    }

    const { data: cancelledIds, error } = await supabase.rpc("delete_event", {
      p_event_id: event.id,
      p_notify: notifyFamilies,
    });
    if (error) return notify("Couldn't delete", error.message);
    pushCancellationNotices(cancelledIds as string[] | null);
    goBackOr("/(tabs)/schedule?section=events");
  };

  const cancelRemainingSeries = async () => {
    if (!event.series_id) return;
    const detail = "This deletes this session and every later one in the series (past sessions are untouched). This can't be undone.";

    let notifyFamilies = false;
    if (isUpcoming) {
      const choice = await chooseAsync("Cancel remaining sessions?", detail, [
        { key: "notify", label: "Cancel and notify families", destructive: true },
        { key: "quiet", label: "Cancel without notifying", destructive: true },
      ]);
      if (!choice) return;
      notifyFamilies = choice === "notify";
    } else if (!(await confirmAsync("Cancel remaining sessions?", detail))) {
      return;
    }

    // One notice for the whole block, not one per session — the trigger folds
    // siblings from the same series together.
    const { data: cancelledIds, error } = await supabase.rpc("cancel_event_series", {
      p_series_id: event.series_id,
      p_from: event.starts_at,
      p_notify: notifyFamilies,
    });
    if (error) return notify("Couldn't cancel sessions", error.message);
    pushCancellationNotices(cancelledIds as string[] | null);
    goBackOr("/(tabs)/schedule?section=events");
  };

  const setRsvp = async (playerId: string, status: RSVPStatus) => {
    const previous = data;
    setData(
      (prev) =>
        prev && {
          ...prev,
          rsvps: [...prev.rsvps.filter((r) => r.player_id !== playerId), { event_id: id!, player_id: playerId, status }],
        },
    );
    const { error } = await supabase
      .from("event_rsvps")
      .upsert({ event_id: id, player_id: playerId, status }, { onConflict: "event_id,player_id" });
    if (error) {
      setData(previous);
      notify("Couldn't save RSVP", error.message);
    }
  };

  const setAttendanceStatus = async (playerId: string, status: AttendanceStatus) => {
    if (!profile?.id) return;
    const previous = data;
    const record: AttendanceRecord = {
      event_id: id!,
      player_id: playerId,
      status,
      marked_by: profile.id,
      marked_at: new Date().toISOString(),
    };
    setData((prev) => prev && { ...prev, attendance: [...prev.attendance.filter((r) => r.player_id !== playerId), record] });
    const { error } = await supabase
      .from("attendance_records")
      .upsert(
        { event_id: id, player_id: playerId, status, marked_by: profile.id, marked_at: record.marked_at },
        { onConflict: "event_id,player_id" },
      );
    if (error) {
      setData(previous);
      notify("Couldn't save attendance", error.message);
    }
  };

  const togglePayment = async (playerId: string) => {
    if (!profile?.id) return;
    const period = format(new Date(event.starts_at), "yyyy-MM");
    const current: PaymentStatus = payments.find((p) => p.player_id === playerId)?.status ?? "unpaid";
    const nextStatus: PaymentStatus = current === "paid" ? "unpaid" : "paid";
    const { data: paymentRow, error } = await supabase
      .from("player_payments")
      .upsert(
        {
          player_id: playerId,
          club_id: event.club_id,
          period,
          status: nextStatus,
          marked_by: profile.id,
          marked_at: new Date().toISOString(),
        },
        { onConflict: "player_id,period" },
      )
      .select()
      .single();
    if (error) return notify("Couldn't update payment status", error.message);
    setData(
      (prev) => prev && { ...prev, payments: [...prev.payments.filter((p) => p.player_id !== playerId), paymentRow as PlayerPayment] },
    );
  };

  const paymentMonth = format(new Date(event.starts_at), "MMMM");
  const noResponse = Math.max(0, players.length - counts.yes - counts.no - counts.maybe);
  const sectionTitle = event.event_players?.length
    ? event.team_id
      ? "Attending Today"
      : event.event_players.length > 1
        ? vocab.member.plural
        : vocab.member.singular
    : isStaff
      ? vocab.rosterTitle
      : `Your ${vocab.member.plural}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: event.title }} />

      <SpotlightCard style={{ gap: space[3] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" }}>
          <Eyebrow tone="onSpotlightMuted">{event.type.replace("_", " ")}</Eyebrow>
          <Badge label={audienceLabel(event, vocab)} tone="neutral" />
        </View>
        <Text role="h1" tone="onSpotlight">
          {event.title}
        </Text>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel this and all future sessions in this series"
          onPress={cancelRemainingSeries}
        >
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
        <EmptyState title={`No eligible ${vocab.member.plural.toLowerCase()} for this event.`} />
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
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={rsvp === option.value}
                      onPress={() => setRsvp(player.id, option.value)}
                    />
                  ))}
                </View>
              </View>

              {isStaff && (
                <View style={{ gap: space[2] }}>
                  <Eyebrow>Attendance</Eyebrow>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
                    {ATTENDANCE_OPTIONS.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={att === option.value}
                        onPress={() => setAttendanceStatus(player.id, option.value)}
                      />
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
