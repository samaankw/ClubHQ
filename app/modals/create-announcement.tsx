import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Switch, ScrollView } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { ANNOUNCEMENT_CATEGORIES, COMPOSABLE_CATEGORIES } from "@/lib/announcementCategories";
import { AnnouncementCategory, AnnouncementTargetType, Team } from "@/types/db";
import { notify } from "@/lib/alertCompat";
import { teamLabel } from "@/lib/teamLabel";
import { goBackOr } from "@/lib/navigation";
import ModalBackButton from "@/components/ModalBackButton";

interface PlayerOption {
  id: string;
  full_name: string;
}

const CATEGORY_KEYS = COMPOSABLE_CATEGORIES;

const AUDIENCE_LABELS: Record<AnnouncementTargetType, string> = {
  everyone: "Everyone",
  team: "Training Group",
  players: "Selected Players",
  parents: "Selected Parents",
};

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
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen
        options={{
          title: isEditing ? "Edit Announcement" : "New Announcement",
          headerLeft: () => <ModalBackButton onPress={() => goBackOr("/(tabs)/schedule?section=announcements")} />,
        }}
      />
      <Text style={styles.label}>CATEGORY</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={styles.chipRow}>
        {CATEGORY_KEYS.map((key) => (
          <Pressable
            key={key}
            style={[styles.chip, category === key && { backgroundColor: ANNOUNCEMENT_CATEGORIES[key].color }]}
            onPress={() => setCategory(key)}
          >
            <Text style={[styles.chipText, category === key && styles.chipTextActive]}>{ANNOUNCEMENT_CATEGORIES[key].label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.label}>AUDIENCE</Text>
      {isEditing ? (
        <View style={styles.audienceLockedRow}>
          <Text style={styles.audienceLockedText}>
            {AUDIENCE_LABELS[targetType]}{targetType === "team" && teams.find((t) => t.id === teamId) ? ` · ${teamLabel(teams.find((t) => t.id === teamId)!)}` : ""}
          </Text>
          <Text style={styles.mutedNote}>Who this was sent to can't be changed after posting — post a new announcement to reach a different audience.</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={styles.chipRow}>
            {profile?.role === "director" && (
              <Pressable style={[styles.chip, targetType === "everyone" && styles.chipActive]} onPress={() => setTargetType("everyone")}>
                <Text style={[styles.chipText, targetType === "everyone" && styles.chipTextActive]}>Everyone</Text>
              </Pressable>
            )}
            <Pressable style={[styles.chip, targetType === "team" && styles.chipActive]} onPress={() => setTargetType("team")}>
              <Text style={[styles.chipText, targetType === "team" && styles.chipTextActive]}>Training Group</Text>
            </Pressable>
            <Pressable style={[styles.chip, targetType === "players" && styles.chipActive]} onPress={() => setTargetType("players")}>
              <Text style={[styles.chipText, targetType === "players" && styles.chipTextActive]}>Selected Players</Text>
            </Pressable>
            <Pressable style={[styles.chip, targetType === "parents" && styles.chipActive]} onPress={() => setTargetType("parents")}>
              <Text style={[styles.chipText, targetType === "parents" && styles.chipTextActive]}>Selected Parents</Text>
            </Pressable>
          </ScrollView>

          {targetType === "team" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={styles.chipRow}>
              {teams.map((team) => (
                <Pressable key={team.id} style={[styles.chip, teamId === team.id && styles.chipActive]} onPress={() => setTeamId(team.id)}>
                  <Text style={[styles.chipText, teamId === team.id && styles.chipTextActive]}>{teamLabel(team)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {(targetType === "players" || targetType === "parents") && (
            <View style={{ marginBottom: 14 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {players.map((p) => (
                  <Pressable key={p.id} style={[styles.chip, selectedPlayerIds.includes(p.id) && styles.chipActive]} onPress={() => togglePlayer(p.id)}>
                    <Text style={[styles.chipText, selectedPlayerIds.includes(p.id) && styles.chipTextActive]}>{p.full_name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {!players.length && <Text style={styles.mutedNote}>No players found yet.</Text>}
            </View>
          )}
        </>
      )}

      <TextInput style={styles.input} placeholder="Title" placeholderTextColor="#8A8D93" value={title} onChangeText={setTitle} />
      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="Keep it short — 1 to 3 sentences is plenty…"
        placeholderTextColor="#8A8D93"
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={6}
      />
      <View style={styles.pinRow}>
        <Text style={styles.pinLabel}>Pin to top</Text>
        <Switch value={pinned} onValueChange={setPinned} trackColor={{ true: "#0A6CFF" }} />
      </View>
      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? (isEditing ? "Saving…" : "Posting…") : isEditing ? "Save Changes" : "Post Announcement"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#0B0B0D", flexGrow: 1 },
  label: { fontSize: 11, fontWeight: "800", color: "#8A8D93", letterSpacing: 0.5, marginBottom: 8 },
  chipRow: { flexDirection: "row", alignItems: "flex-start" },
  chip: { marginRight: 8, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 18, backgroundColor: "#1A1B1E" },
  chipActive: { backgroundColor: "#0A6CFF" },
  chipText: { color: "#C7C9CE", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  mutedNote: { color: "#8A8D93", fontSize: 13, marginTop: 6 },
  audienceLockedRow: { backgroundColor: "#141416", borderRadius: 10, padding: 14, marginBottom: 14 },
  audienceLockedText: { color: "#F2F2F3", fontWeight: "700", fontSize: 14 },
  input: { borderWidth: 1, borderColor: "#242529", borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 16, color: "#fff", backgroundColor: "#141416" },
  textarea: { height: 140, textAlignVertical: "top" },
  pinRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  pinLabel: { fontSize: 15, fontWeight: "600", color: "#fff" },
  button: { backgroundColor: "#0A6CFF", borderRadius: 10, padding: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
