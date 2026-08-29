import React, { useEffect, useState } from "react";
import { View, Pressable, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/announcementCategories";
import { AnnouncementCategory, AnnouncementTargetType, Team } from "@/types/db";
import { notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";
import { Screen, Card, Text, Eyebrow, Field, Button, Chip, IconChip, Toggle } from "@/components/ui";
import type { ChipTone } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

interface PlayerOption {
  id: string;
  full_name: string;
}

const CATEGORY_KEYS = Object.keys(ANNOUNCEMENT_CATEGORIES) as AnnouncementCategory[];

const AUDIENCE_LABELS: Record<AnnouncementTargetType, string> = {
  everyone: "Everyone",
  team: "Training Group",
  players: "Selected Players",
  parents: "Selected Parents",
};

// Maps each category's urgency tier to an IconChip tint, so the grid reads
// at a glance without depending on the selection outline alone.
const TIER_TONE: Record<"changed" | "opportunity" | "info", ChipTone> = {
  changed: "warning",
  opportunity: "success",
  info: "brand",
};

function CategoryCard({
  meta,
  selected,
  onPress,
}: {
  meta: (typeof ANNOUNCEMENT_CATEGORIES)[AnnouncementCategory];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={meta.label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.typeCard, selected && styles.typeCardSelected]}
    >
      <IconChip name={meta.icon} tone={TIER_TONE[meta.tier]} />
      <Text role="label" tone={selected ? "brand" : "primary"} style={styles.typeCardLabel}>
        {meta.label}
      </Text>
    </Pressable>
  );
}

export default function CreateAnnouncement() {
  const { profile } = useAuth();
  const { announcementId } = useLocalSearchParams<{ announcementId?: string }>();
  const isEditing = !!announcementId;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [category, setCategory] = useState<AnnouncementCategory>("general");
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<AnnouncementTargetType>("everyone");
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Editing only changes the message itself (category/title/body/pin) — not
  // who it was sent to. Re-targeting after the fact would mean some
  // recipients saw the old audience's version and others a different one,
  // which is more confusing than just posting a fresh announcement instead.
  useEffect(() => {
    if (!announcementId) return;
    (async () => {
      const { data, error } = await supabase.from("announcements").select("*").eq("id", announcementId).single();
      if (error || !data) {
        notify("Couldn't load announcement", error?.message ?? "Announcement not found.");
        return;
      }
      setCategory(data.category);
      setTitle(data.title);
      setBody(data.body);
      setPinned(data.pinned);
      setTargetType(data.target_type);
      setTeamId(data.team_id);
    })();
  }, [announcementId]);

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
      if (profile.role === "coach" && next.length) setTeamId(next[0].id);
    })();
  }, [profile?.club_id, profile?.id, profile?.role]);

  // Player list for "Selected Players" / "Selected Parents" targeting. The
  // `teams` list above is already scoped correctly for the current role
  // (coach: only assigned teams, director: the whole club), so filtering
  // players by those team ids scopes this the same way.
  useEffect(() => {
    (async () => {
      if (targetType !== "players" && targetType !== "parents") return;
      const teamIds = teams.map((t) => t.id);
      if (!teamIds.length) { setPlayers([]); return; }
      const { data } = await supabase
        .from("players")
        .select("id, full_name")
        .in("team_id", teamIds)
        .is("archived_at", null)
        .order("full_name");
      setPlayers((data as PlayerOption[]) ?? []);
    })();
  }, [targetType, teams]);

  const togglePlayer = (id: string) => {
    setSelectedPlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) return notify("Missing info", "Please add a title and message.");
    if (!profile?.club_id) return notify("No club found", "Your profile isn't linked to a club yet.");

    if (isEditing) {
      setSubmitting(true);
      const { error } = await supabase
        .from("announcements")
        .update({ category, title: title.trim(), body: body.trim(), pinned })
        .eq("id", announcementId);
      setSubmitting(false);
      if (error) return notify("Couldn't save changes", error.message);
      goBackOr("/(tabs)/schedule?section=announcements");
      return;
    }

    if (targetType === "team" && !teamId) return notify("Group required", "Pick a training group to post to.");
    if ((targetType === "players" || targetType === "parents") && !selectedPlayerIds.length) {
      return notify("No one selected", "Pick at least one player.");
    }

    setSubmitting(true);
    const { data, error } = await supabase
      .from("announcements")
      .insert({
        club_id: profile.club_id,
        team_id: targetType === "team" ? teamId : null,
        target_type: targetType,
        category,
        author_id: profile.id,
        title: title.trim(),
        body: body.trim(),
        pinned,
      })
      .select()
      .single();

    if (error) {
      setSubmitting(false);
      return notify("Couldn't post", error.message);
    }

    if ((targetType === "players" || targetType === "parents") && selectedPlayerIds.length) {
      const { error: targetErr } = await supabase
        .from("announcement_player_targets")
        .insert(selectedPlayerIds.map((player_id) => ({ announcement_id: data.id, player_id })));
      if (targetErr) {
        setSubmitting(false);
        return notify("Posted, but targeting failed", targetErr.message);
      }
    }

    setSubmitting(false);

    // Fire-and-forget: the announcement is already posted and visible in the
    // app either way, so a push-notification hiccup shouldn't block the coach
    // from moving on or show them a scary error for something non-critical.
    supabase.functions.invoke("send-announcement-push", { body: { announcementId: data.id } }).catch((err) => {
      console.warn("Announcement push notification failed to send:", err);
    });

    goBackOr("/(tabs)/schedule?section=announcements");
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: isEditing ? "Edit Announcement" : "New Announcement",
          headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/schedule?section=announcements")} />,
        }}
      />

      <View style={styles.section}>
        <Eyebrow>What kind of announcement?</Eyebrow>
        <View style={styles.typeGrid}>
          {CATEGORY_KEYS.map((key) => (
            <CategoryCard
              key={key}
              meta={ANNOUNCEMENT_CATEGORIES[key]}
              selected={category === key}
              onPress={() => setCategory(key)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Eyebrow>Audience</Eyebrow>
        {isEditing ? (
          <Card style={styles.audienceLockedCard}>
            <Text role="h3">
              {AUDIENCE_LABELS[targetType]}
              {targetType === "team" && teams.find((t) => t.id === teamId) ? ` · ${teamLabel(teams.find((t) => t.id === teamId)!)}` : ""}
            </Text>
            <Text tone="secondary">
              Who this was sent to can't be changed after posting — post a new announcement to reach a different audience.
            </Text>
          </Card>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {profile?.role === "director" && (
                <Chip label="Everyone" selected={targetType === "everyone"} onPress={() => setTargetType("everyone")} />
              )}
              <Chip label="Training Group" selected={targetType === "team"} onPress={() => setTargetType("team")} />
              <Chip label="Selected Players" selected={targetType === "players"} onPress={() => setTargetType("players")} />
              <Chip label="Selected Parents" selected={targetType === "parents"} onPress={() => setTargetType("parents")} />
            </ScrollView>

            {targetType === "team" && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {teams.map((team) => (
                  <Chip key={team.id} label={teamLabel(team)} selected={teamId === team.id} onPress={() => setTeamId(team.id)} />
                ))}
              </ScrollView>
            )}

            {(targetType === "players" || targetType === "parents") && (
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {players.map((p) => (
                    <Chip key={p.id} label={p.full_name} selected={selectedPlayerIds.includes(p.id)} onPress={() => togglePlayer(p.id)} />
                  ))}
                </ScrollView>
                {!players.length && <Text tone="secondary">No players found yet.</Text>}
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.section}>
        <Field placeholder="Title" value={title} onChangeText={setTitle} />

        <View>
          <View style={styles.fieldLabelRow}>
            <Eyebrow>Message</Eyebrow>
            <View style={styles.aiPolish}>
              <Ionicons name="sparkles" size={12} color={color.icon.brand} />
              <Text role="caption" tone="brand">AI Polish</Text>
            </View>
          </View>
          <Field
            placeholder="Keep it short — 1 to 3 sentences is plenty…"
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={6}
          />
        </View>

        <Toggle label="Pin to top" value={pinned} onValueChange={setPinned} />
      </View>

      <Button
        label={submitting ? (isEditing ? "Saving…" : "Posting…") : isEditing ? "Save Changes" : "Post Announcement"}
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
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
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
  typeCardLabel: { flexShrink: 1 },
  chipRow: { flexDirection: "row", gap: space[2] },
  audienceLockedCard: { gap: space[2] },
  fieldLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space[2] },
  aiPolish: { flexDirection: "row", alignItems: "center", gap: space[1] },
});
