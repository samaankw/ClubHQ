import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, StyleSheet, ScrollView, LayoutChangeEvent, AccessibilityInfo, BackHandler } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { addDays, format, nextSaturday, parse, startOfDay } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { useRecentLocations } from "@/lib/hooks";
import { ClubEvent, EventType, Team } from "@/types/db";
import { notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { goBackOr } from "@/lib/navigation";
import { TIME_PRESETS, matchTimePreset, buildStartsAt, weeklyOccurrences } from "@/lib/eventSchedule";
import { resolveTargeting, AudienceMode } from "@/lib/eventTargeting";
import ModalBackButton from "@/components/ModalBackButton";
import {
  Screen,
  Card,
  Text,
  Eyebrow,
  Field,
  Button,
  Chip,
  IconChip,
  Toggle,
  CardHeader,
  Calendar,
  FilterChipRow,
  ProgressBar,
} from "@/components/ui";
import type { IconName } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

interface PlayerOption {
  id: string;
  full_name: string;
  teams?: { age_group: string | null } | null;
}

// Mirrors the icon choice dashboard.tsx and the Schedule tab already use for
// these same four event types, so a type card here matches what a user has
// already seen elsewhere.
const TYPE_ICON: Record<EventType, IconName> = {
  practice: "fitness",
  game: "football",
  tournament: "trophy",
  club_event: "megaphone",
  // Not yet offered in the TYPES picker below (no UI for private-trainer/
  // academy org types exists on this branch yet), but EventType's CHECK
  // constraint already accepts these, so the Record must cover them.
  clinic: "school-outline",
  camp: "sunny-outline",
  private_session: "person-outline",
  small_group: "people-outline",
};

const TYPES: { key: EventType; label: string }[] = [
  { key: "practice", label: "Practice" },
  { key: "game", label: "Game" },
  { key: "tournament", label: "Tournament" },
  { key: "club_event", label: "Club Event" },
];

// "Custom" reveals the original hour/minute/AM-PM fields for anything the
// TIME_PRESETS chips don't cover, so there's still exactly one way to end up
// with an arbitrary time.
const CUSTOM_TIME = "Custom";
const TIME_OPTIONS = [...TIME_PRESETS.map((p) => p.label), CUSTOM_TIME];

function TypeCard({ icon, label, selected, onPress }: { icon: IconName; label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.typeCard, selected && styles.typeCardSelected]}
    >
      <IconChip name={icon} tone="brand" />
      <Text role="label" tone={selected ? "brand" : "primary"}>
        {label}
      </Text>
    </Pressable>
  );
}

function CheckRow({ label, meta, checked, onPress }: { label: string; meta?: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.checkRow}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? (
          <Text role="caption" tone="inverse">
            ✓
          </Text>
        ) : null}
      </View>
      <Text role="h3" style={styles.checkRowLabel}>
        {label}
      </Text>
      {meta ? (
        <Text role="caption" tone="brand" style={styles.checkRowMeta}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

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
  // Which time chip reads as selected — one of TIME_PRESETS' labels, or
  // CUSTOM_TIME, or "" before the coach has touched a time at all. This is
  // purely a UI selection: hourStr/minuteStr/meridiem above stay the single
  // source of truth that feeds starts_at on submit, whether they were set by
  // tapping a chip or by typing into the custom fields.
  const [timeChip, setTimeChip] = useState("");
  const [notes, setNotes] = useState("");
  const { locations: recentLocations } = useRecentLocations();
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
  // Set only during the recurring-creation loop below, so a single-event
  // create/edit shows the ordinary "Saving…" button label with nothing else.
  const [creationProgress, setCreationProgress] = useState<{ done: number; total: number } | null>(null);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [dateError, setDateError] = useState<string | undefined>();
  const [timeError, setTimeError] = useState<string | undefined>();
  const [teamError, setTeamError] = useState<string | undefined>();
  const [attendingError, setAttendingError] = useState<string | undefined>();
  const [playerError, setPlayerError] = useState<string | undefined>();
  const [repeatError, setRepeatError] = useState<string | undefined>();
  const scrollRef = useRef<ScrollView>(null);
  // Y offset of each section inside the scroll column, recorded as it lays out.
  // A failed submit scrolls to the section that actually errored. Scrolling to
  // the top instead would push the Time and Repeat errors — which sit near the
  // bottom of this long form, right above the button the user just pressed —
  // off screen, making a failed submit look like nothing happened at all.
  const sectionY = useRef<Record<string, number>>({});
  const onSectionLayout = (key: string) => (e: LayoutChangeEvent) => {
    sectionY.current[key] = e.nativeEvent.layout.y;
  };
  const scrollToSection = (key: string, message: string) => {
    // Scrolling moves the error into a sighted user's view; it does nothing
    // for a screen-reader user, who otherwise gets no feedback at all from a
    // failed submit. Announcing the message covers both.
    AccessibilityInfo.announceForAccessibility(message);
    const y = sectionY.current[key];
    if (y === undefined) return;
    // Leave a gutter above the section so its label isn't flush to the edge.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - space[4]), animated: true });
  };

  const togglePlayer = (id: string) => {
    setSelectedPlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const toggleAttending = (id: string) => {
    setAttendingIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  // Tapping a preset chip sets exactly the same hourStr/minuteStr/meridiem
  // state the custom fields would — there is one path into starts_at, chips
  // just fill it in faster. "Custom" leaves whatever is already there and
  // reveals the fields so the coach can type something else.
  const handleTimePick = (label: string) => {
    setTimeChip(label);
    const preset = TIME_PRESETS.find((p) => p.label === label);
    if (!preset) return;
    setHourStr(preset.hour);
    setMinuteStr(preset.minute);
    setMeridiem(preset.meridiem);
  };

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data, error } = await supabase.from("events").select("*, event_players(players(id))").eq("id", eventId).single();
      if (error || !data) {
        notify("Couldn't load event", error?.message ?? "Event not found.");
        return;
      }
      const ev = data as ClubEvent;
      setType(ev.type);
      setTitle(ev.title);
      setLocation(ev.location ?? "");
      const startsAt = new Date(ev.starts_at);
      const loadedHour = format(startsAt, "h");
      const loadedMinute = format(startsAt, "mm");
      const loadedMeridiem = format(startsAt, "a") as "AM" | "PM";
      setDateStr(format(startsAt, "yyyy-MM-dd"));
      setHourStr(loadedHour);
      setMinuteStr(loadedMinute);
      setMeridiem(loadedMeridiem);
      // A prefilled time that isn't one of the chips must fall back to the
      // custom fields rather than being silently rounded to the nearest one.
      const preset = matchTimePreset(loadedHour, loadedMinute, loadedMeridiem);
      setTimeChip(preset ? preset.label : CUSTOM_TIME);
      setNotes(ev.notes ?? "");

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
        if (!ids.length) {
          setTeams([]);
          return;
        }
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
      if (audienceMode !== "team" || !teamId) {
        setTeamRoster([]);
        setAttendingIds([]);
        return;
      }
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
      if (!teamIds.length) {
        setPlayers([]);
        return;
      }
      const { data } = await supabase
        .from("players")
        .select("id, full_name, teams(age_group)")
        .in("team_id", teamIds)
        .is("archived_at", null)
        .order("full_name");
      setPlayers((data as unknown as PlayerOption[]) ?? []);
    })();
  }, [audienceMode, teams]);

  // Android's hardware back button bypasses the header entirely, so it needs
  // its own guard: while a submit (especially a multi-week recurring create)
  // is in flight, there is no cancellation for the RPC calls already
  // underway -- letting the user navigate away just means they keep running
  // against a screen nobody's looking at, and whatever notify()/goBackOr()
  // fires when they finish lands on a route the user already left. Returning
  // true here means "handled, don't do the default back."
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => submitting);
    return () => sub.remove();
  }, [submitting]);

  const handleSubmit = async () => {
    if (!title.trim() || !dateStr || !hourStr || !minuteStr) {
      setTitleError(!title.trim() ? "Add a title." : undefined);
      setDateError(!dateStr ? "Pick a date." : undefined);
      setTimeError(!hourStr || !minuteStr ? "Pick a time." : undefined);
      // Several fields can fail at once; land on the topmost one so the user
      // works downward through the form rather than jumping around it.
      scrollToSection(
        !title.trim() ? "title" : !dateStr ? "date" : "time",
        !title.trim() ? "Add a title." : !dateStr ? "Pick a date." : "Pick a time.",
      );
      return;
    }
    setTitleError(undefined);
    setDateError(undefined);
    if (!profile?.club_id) return notify("No club found", "Your profile isn't linked to a club yet.");
    if (audienceMode === "team" && !teamId) {
      setTeamError("Pick a training group for this event.");
      scrollToSection("team", "Pick a training group for this event.");
      return;
    }
    setTeamError(undefined);
    if (audienceMode === "team" && teamRoster.length > 0 && !attendingIds.length) {
      setAttendingError("Pick at least one player training that day, or switch groups.");
      scrollToSection("attending", "Pick at least one player training that day, or switch groups.");
      return;
    }
    setAttendingError(undefined);
    if (audienceMode === "player" && !selectedPlayerIds.length) {
      setPlayerError("Pick who this session is for.");
      scrollToSection("player", "Pick who this session is for.");
      return;
    }
    setPlayerError(undefined);

    const hour12 = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    if (isNaN(hour12) || hour12 < 1 || hour12 > 12 || isNaN(minute) || minute < 0 || minute > 59) {
      setTimeError("Hour must be 1–12 and minutes 0–59.");
      scrollToSection("time", "Hour must be 1–12 and minutes 0–59.");
      return;
    }
    setTimeError(undefined);
    const startsAt = buildStartsAt(dateStr, hour12, minute, meridiem);
    if (isNaN(startsAt.getTime())) {
      setDateError("Use YYYY-MM-DD for the date.");
      scrollToSection("date", "Use YYYY-MM-DD for the date.");
      return;
    }
    setDateError(undefined);

    const { teamId: targetTeamId, playerIds } = resolveTargeting({
      audienceMode,
      teamId,
      selectedPlayerIds,
      attendingIds,
      teamRoster,
    });

    const occurrenceCount = !isEditing && repeatWeekly ? parseInt(repeatWeeksStr, 10) : 1;
    if (!isEditing && repeatWeekly && (isNaN(occurrenceCount) || occurrenceCount < 2 || occurrenceCount > 52)) {
      setRepeatError("Enter a number of weeks between 2 and 52.");
      scrollToSection("repeat", "Enter a number of weeks between 2 and 52.");
      return;
    }
    setRepeatError(undefined);

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
        p_team_id: targetTeamId,
        p_player_ids: playerIds,
      });
      setSubmitting(false);
      if (error) return notify("Couldn't save changes", error.message);

      // Fire-and-forget, same as on create — a time/location change is
      // exactly the kind of edit parents need to actually be told about,
      // not just something they'd only see if they happened to reopen the app.
      supabase.functions.invoke("send-event-push", { body: { eventId, isUpdate: true } }).catch((err) => {
        console.warn("Event update push notification failed to send:", err);
      });

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
        p_team_id: targetTeamId,
        p_player_ids: playerIds,
        p_series_id: seriesIdArg,
      });

    let seriesId: string | null = null;
    let firstEventId: string | null = null;
    const occurrences = weeklyOccurrences(startsAt, occurrenceCount);
    if (occurrenceCount > 1) setCreationProgress({ done: 0, total: occurrenceCount });
    for (let i = 0; i < occurrenceCount; i++) {
      const { data: newEventId, error } = await createOccurrence(occurrences[i].toISOString(), seriesId);
      if (error) {
        setSubmitting(false);
        setCreationProgress(null);
        return notify(
          i === 0 ? "Couldn't create event" : "Some sessions couldn't be created",
          i === 0 ? error.message : `Created ${i} of ${occurrenceCount} sessions before hitting an error: ${error.message}`,
        );
      }
      if (i === 0) {
        seriesId = newEventId;
        firstEventId = newEventId;
      }
      if (occurrenceCount > 1) setCreationProgress({ done: i + 1, total: occurrenceCount });
    }
    setSubmitting(false);
    setCreationProgress(null);

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

  // date-fns' nextSaturday returns the Saturday *after* the given date, so
  // when today is already Saturday this correctly lands 7 days out — "the
  // coming Saturday", never today.
  const today = new Date();
  const quickDates = [
    { label: "Today", value: format(today, "yyyy-MM-dd") },
    { label: "Tomorrow", value: format(addDays(today, 1), "yyyy-MM-dd") },
    { label: "This Saturday", value: format(nextSaturday(today), "yyyy-MM-dd") },
  ];
  const selectedDate = dateStr ? parse(dateStr, "yyyy-MM-dd", new Date()) : null;
  const showCustomTime = timeChip === CUSTOM_TIME;

  return (
    <Screen ref={scrollRef}>
      <Stack.Screen
        options={{
          title: isEditing ? "Edit Event" : "New Event",
          // iOS swipe-to-dismiss, gated the same as the header button and the
          // Android hardware-back listener below -- see that listener's
          // comment for why navigating away mid-submit isn't safe here.
          gestureEnabled: !submitting,
          headerLeft: () => (
            <ModalBackButton
              onPress={() => {
                if (submitting) return;
                goBackOr(isEditing ? `/event/${eventId}` : "/(tabs)/schedule?section=events");
              }}
            />
          ),
        }}
      />

      <View style={styles.section}>
        <Eyebrow>What kind of event?</Eyebrow>
        <View style={styles.typeGrid}>
          {TYPES.map((t) => (
            <TypeCard key={t.key} icon={TYPE_ICON[t.key]} label={t.label} selected={type === t.key} onPress={() => setType(t.key)} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Eyebrow>Audience</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {profile?.role === "director" && (
            <Chip label="Club-wide" selected={audienceMode === "club"} onPress={() => setAudienceMode("club")} />
          )}
          <Chip label="Training Group" selected={audienceMode === "team"} onPress={() => setAudienceMode("team")} />
          <Chip label="Select Players" selected={audienceMode === "player"} onPress={() => setAudienceMode("player")} />
        </ScrollView>
      </View>

      {audienceMode === "team" && (
        <View style={styles.section} onLayout={onSectionLayout("team")}>
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
          {!teams.length && <Text tone="secondary">No training groups assigned yet.</Text>}
          {teamError ? (
            <Text role="caption" tone="danger">
              {teamError}
            </Text>
          ) : null}
        </View>
      )}

      {audienceMode === "team" && teamId && teamRoster.length > 0 && (
        <Card style={styles.rosterCard} onLayout={onSectionLayout("attending")}>
          <CardHeader
            title={`Who's training today? (${attendingIds.length}/${teamRoster.length})`}
            action={attendingIds.length === teamRoster.length ? "Clear all" : "Select all"}
            onAction={() => {
              setAttendingIds(attendingIds.length === teamRoster.length ? [] : teamRoster.map((p) => p.id));
              // "Select all" is the fastest way to fix this exact error, so it
              // has to clear it the same way tapping a single player does.
              if (attendingError) setAttendingError(undefined);
            }}
          />
          {teamRoster.map((p) => (
            <CheckRow
              key={p.id}
              label={p.full_name}
              checked={attendingIds.includes(p.id)}
              onPress={() => {
                toggleAttending(p.id);
                if (attendingError) setAttendingError(undefined);
              }}
            />
          ))}
          {attendingError ? (
            <Text role="caption" tone="danger">
              {attendingError}
            </Text>
          ) : null}
        </Card>
      )}

      {audienceMode === "player" && (
        <Card style={styles.rosterCard} onLayout={onSectionLayout("player")}>
          <Eyebrow>Pick anyone, from any group ({selectedPlayerIds.length} selected)</Eyebrow>
          {players.map((p) => (
            <CheckRow
              key={p.id}
              label={p.full_name}
              meta={p.teams?.age_group ?? undefined}
              checked={selectedPlayerIds.includes(p.id)}
              onPress={() => {
                togglePlayer(p.id);
                if (playerError) setPlayerError(undefined);
              }}
            />
          ))}
          {!players.length && <Text tone="secondary">No players found on your teams yet.</Text>}
          {playerError ? (
            <Text role="caption" tone="danger">
              {playerError}
            </Text>
          ) : null}
        </Card>
      )}

      <View style={styles.section} onLayout={onSectionLayout("title")}>
        <Field
          placeholder="Title (e.g. U10 vs Northside FC)"
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (titleError) setTitleError(undefined);
          }}
          error={titleError}
        />

        {!!recentLocations.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {recentLocations.map((loc) => (
              <Chip key={loc} label={loc} selected={location.trim().toLowerCase() === loc.toLowerCase()} onPress={() => setLocation(loc)} />
            ))}
          </ScrollView>
        )}
        <Field placeholder="Location" value={location} onChangeText={setLocation} />
      </View>

      <View style={styles.section} onLayout={onSectionLayout("date")}>
        <Eyebrow>Date</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {quickDates.map((q) => (
            <Chip
              key={q.label}
              label={q.label}
              selected={dateStr === q.value}
              onPress={() => {
                setDateStr(q.value);
                if (dateError) setDateError(undefined);
              }}
            />
          ))}
        </ScrollView>
        <Calendar
          value={selectedDate}
          // New events can't be scheduled into the past, but an edit has to be
          // able to reach a past date to correct an event that already
          // happened — this grid is the only date input on the form.
          minDate={isEditing ? undefined : startOfDay(new Date())}
          onChange={(d) => {
            setDateStr(format(d, "yyyy-MM-dd"));
            if (dateError) setDateError(undefined);
          }}
        />
        {dateError ? (
          <Text role="caption" tone="danger">
            {dateError}
          </Text>
        ) : null}
      </View>

      <View style={styles.section} onLayout={onSectionLayout("time")}>
        <Eyebrow>Time</Eyebrow>
        <FilterChipRow
          options={TIME_OPTIONS}
          value={timeChip}
          onChange={(label) => {
            handleTimePick(label);
            if (timeError) setTimeError(undefined);
          }}
        />
        {showCustomTime && (
          <View style={styles.iconFieldRow}>
            <IconChip name="time-outline" />
            <View style={styles.timeRow}>
              <Field
                style={styles.timeInput}
                placeholder="3"
                value={hourStr}
                onChangeText={(v) => {
                  setHourStr(v);
                  if (timeError) setTimeError(undefined);
                }}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text role="h2">:</Text>
              <Field
                style={styles.timeInput}
                placeholder="00"
                value={minuteStr}
                onChangeText={(v) => {
                  setMinuteStr(v);
                  if (timeError) setTimeError(undefined);
                }}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Chip label="AM" selected={meridiem === "AM"} onPress={() => setMeridiem("AM")} />
              <Chip label="PM" selected={meridiem === "PM"} onPress={() => setMeridiem("PM")} />
            </View>
          </View>
        )}
        {timeError ? (
          <Text role="caption" tone="danger">
            {timeError}
          </Text>
        ) : null}
      </View>

      {!isEditing && (
        <Card style={styles.rosterCard} onLayout={onSectionLayout("repeat")}>
          <Toggle label="Repeats weekly" value={repeatWeekly} onValueChange={setRepeatWeekly} />
          {repeatWeekly && (
            <View style={styles.repeatWeeksRow}>
              <Text tone="secondary">Same day and time, for</Text>
              <Field
                style={styles.repeatWeeksInput}
                value={repeatWeeksStr}
                onChangeText={(v) => {
                  setRepeatWeeksStr(v);
                  if (repeatError) setRepeatError(undefined);
                }}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text tone="secondary">weeks</Text>
            </View>
          )}
          {repeatError ? (
            <Text role="caption" tone="danger">
              {repeatError}
            </Text>
          ) : null}
        </Card>
      )}

      <Field placeholder="Notes (optional)" value={notes} onChangeText={setNotes} multiline />

      {creationProgress && (
        <View style={{ gap: space[2] }}>
          <Text tone="secondary" role="bodySm">
            Creating session {creationProgress.done} of {creationProgress.total}…
          </Text>
          <ProgressBar value={creationProgress.done / creationProgress.total} />
        </View>
      )}

      <Button
        label={
          creationProgress
            ? `Creating ${creationProgress.done} of ${creationProgress.total}…`
            : submitting
              ? isEditing
                ? "Saving…"
                : "Creating…"
              : isEditing
                ? "Save Changes"
                : "Add to Schedule"
        }
        onPress={handleSubmit}
        disabled={submitting}
        size="lg"
        fullWidth
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[3] },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  typeCard: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    padding: space[3],
    borderRadius: radius.card,
    borderWidth: borderWidth.thin,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  typeCardSelected: { borderColor: color.border.brand },
  chipRow: { flexDirection: "row", gap: space[2] },
  rosterCard: { gap: space[2] },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[2] },
  checkRowLabel: { flex: 1 },
  checkRowMeta: { backgroundColor: color.bg.sunken, borderRadius: radius.sm, paddingHorizontal: space[2], paddingVertical: space[1] },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.xs,
    borderWidth: borderWidth.thin,
    borderColor: color.border.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: color.bg.brand },
  iconFieldRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  timeRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[2] },
  timeInput: { width: 56, textAlign: "center" },
  repeatWeeksRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  repeatWeeksInput: { width: 56, textAlign: "center" },
});
