import React, { useCallback, useEffect, useState } from "react";
import { useMemo } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { confirmAsync, notify } from "@/lib/alertCompat";
import { Drill } from "@/types/db";
import DrillVideoModal from "@/components/DrillVideoModal";
import { Screen, Card, Eyebrow, Text, Button, Field, Chip, FilterChipRow, Badge, IconChip, Divider, EmptyState } from "@/components/ui";
import { color, space, radius } from "@/theme";

async function uploadDrillVideo(clubId: string, localUri: string): Promise<string> {
  const extMatch = /\.(\w+)$/.exec(localUri);
  const ext = extMatch ? extMatch[1] : "mp4";
  const path = `drills/${clubId}/${Date.now()}.${ext}`;

  // Supabase Storage's client upload wants a Blob/ArrayBuffer, not a bare file
  // URI — fetching the local file and reading it as an ArrayBuffer is the
  // standard way to get one out of Expo's file system in React Native.
  const response = await fetch(localUri);
  const bytes = await response.arrayBuffer();

  const { error } = await supabase.storage.from("club-media").upload(path, bytes, {
    contentType: `video/${ext === "mov" ? "quicktime" : ext}`,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("club-media").getPublicUrl(path);
  return data.publicUrl;
}

const SKILLS: { key: string; label: string }[] = [
  { key: "first_touch", label: "First Touch" },
  { key: "ball_control", label: "Ball Control" },
  { key: "passing", label: "Passing" },
  { key: "dribbling", label: "Dribbling" },
  { key: "weak_foot", label: "Weak Foot" },
  { key: "finishing", label: "Finishing" },
  { key: "decision_making", label: "Decision Making" },
  { key: "scanning", label: "Scanning" },
  { key: "speed", label: "Speed" },
  { key: "positioning", label: "Positioning" },
];

const CATEGORY_OPTIONS = ["All", ...SKILLS.map((s) => s.label)];

export default function ManageDrills() {
  const { profile } = useAuth();
  const [drills, setDrills] = useState<Drill[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [skill, setSkill] = useState("first_touch");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [watchingDrill, setWatchingDrill] = useState<Drill | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [titleError, setTitleError] = useState<string | undefined>();
  const [descriptionError, setDescriptionError] = useState<string | undefined>();

  const canManageDrills = profile?.role === "coach" || profile?.role === "director";

  const canEdit = (drill: Drill) =>
    canManageDrills && !!drill.club_id && (profile?.role === "director" || drill.added_by === profile?.id);

  const resetForm = () => {
    setEditingId(null);
    setSkill("first_touch");
    setTitle("");
    setDescription("");
    setVideoUrl("");
    setTitleError(undefined);
    setDescriptionError(undefined);
  };

  const startEdit = (drill: Drill) => {
    setEditingId(drill.id);
    setSkill(drill.skill);
    setTitle(drill.title);
    setDescription(drill.description);
    setVideoUrl(drill.video_url ?? "");
    // The fields are being overwritten with real values, so any error left
    // over from a previous empty submit no longer describes what's on screen.
    setTitleError(undefined);
    setDescriptionError(undefined);
    setShowForm(true);
  };

  const deleteDrill = async (drill: Drill) => {
    const ok = await confirmAsync(`Delete "${drill.title}"?`, "The AI will stop assigning this drill as homework. This can't be undone.");
    if (!ok) return;
    const { data, error } = await supabase.from("drills").delete().eq("id", drill.id).select();
    if (error) return notify("Couldn't delete", error.message);
    if (!data || data.length === 0) return notify("Couldn't delete", "You don't have permission to delete this drill.");
    load();
  };

  const uploadPickedVideo = async (result: ImagePicker.ImagePickerResult) => {
    if (!profile?.club_id || result.canceled || !result.assets?.[0]?.uri) return;
    setUploadingVideo(true);
    try {
      const publicUrl = await uploadDrillVideo(profile.club_id, result.assets[0].uri);
      setVideoUrl(publicUrl);
    } catch (err) {
      notify("Upload failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploadingVideo(false);
    }
  };

  const pickAndUploadVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify("Permission needed", "Allow photo library access to pick a video.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });
    await uploadPickedVideo(result);
  };

  const recordAndUploadVideo = async () => {
    // expo-image-picker doesn't expose a separate microphone permission call —
    // launching the camera in video mode triggers the OS's own mic prompt as
    // needed (NSMicrophoneUsageDescription on iOS, RECORD_AUDIO on Android,
    // both already declared in app.json).
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (!cameraPermission.granted) {
      notify("Permission needed", "Allow camera access to record a drill video.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 120,
      quality: 1,
    });
    await uploadPickedVideo(result);
  };

  const load = useCallback(async () => {
    if (!profile?.club_id) return;
    const { data } = await supabase
      .from("drills")
      .select("*")
      .or(`club_id.is.null,club_id.eq.${profile.club_id}`)
      .order("skill", { ascending: true });
    setDrills((data as Drill[]) ?? []);
  }, [profile?.club_id]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    // Checked separately from the field validation below: folding it into the
    // same condition meant a null club_id set both errors to undefined and
    // returned, so the button did nothing at all with nothing to explain it.
    if (!profile?.club_id) {
      return notify("No club found", "Your profile isn't linked to a club yet.");
    }
    if (!title.trim() || !description.trim()) {
      setTitleError(!title.trim() ? "Add a drill title." : undefined);
      setDescriptionError(!description.trim() ? "Add instructions a parent/player can follow." : undefined);
      return;
    }
    setSubmitting(true);
    const { error } = editingId
      ? await supabase
          .from("drills")
          .update({ skill, title: title.trim(), description: description.trim(), video_url: videoUrl.trim() || null })
          .eq("id", editingId)
      : await supabase.from("drills").insert({
          club_id: profile.club_id,
          skill,
          title: title.trim(),
          description: description.trim(),
          video_url: videoUrl.trim() || null,
          added_by: profile.id,
        });
    setSubmitting(false);
    if (error) {
      notify("Couldn't save", error.message);
      return;
    }
    resetForm();
    setShowForm(false);
    load();
  };

  const visibleDrills = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drills.filter((d) => {
      if (category !== "All") {
        const key = SKILLS.find((s) => s.label === category)?.key;
        if (d.skill !== key) return false;
      }
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q);
    });
  }, [drills, category, query]);

  const listHeader = (
    <View style={{ gap: space[3] }}>
      <View style={[styles.infoCallout, styles.inset]}>
        <IconChip name="sparkles" tone="brand" />
        <Text tone="secondary" style={{ flex: 1 }}>
          {canManageDrills
            ? "The AI only assigns homework from this library — add your own videos here so it always points players to something you've vetted."
            : "The AI only assigns homework from this vetted library — coaches and directors keep it up to date."}
        </Text>
      </View>

      <View style={styles.inset}>
        <Field placeholder="Search drills…" value={query} onChangeText={setQuery} />
      </View>

      <FilterChipRow options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />

      {canManageDrills && (
        <View style={[styles.inset, { gap: space[3] }]}>
          <Button label={showForm ? "Cancel" : "+ Add a Drill"} fullWidth onPress={() => {
            if (showForm) resetForm();
            setShowForm((s) => !s);
          }} />

          {showForm && (
            <Card style={{ gap: space[3] }}>
              {editingId ? <Eyebrow tone="brand">Editing Drill</Eyebrow> : null}
              <View style={styles.chipRow}>
                {SKILLS.map((s) => (
                  <Chip key={s.key} label={s.label} selected={skill === s.key} onPress={() => setSkill(s.key)} />
                ))}
              </View>
              <Field
                placeholder="Drill title"
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  if (titleError) setTitleError(undefined);
                }}
                error={titleError}
              />
              <Field
                placeholder="Instructions a parent/player can follow"
                value={description}
                onChangeText={(v) => {
                  setDescription(v);
                  if (descriptionError) setDescriptionError(undefined);
                }}
                multiline
                error={descriptionError}
              />
              {videoUrl ? (
                <Button label="Video uploaded ✓ — replace it" variant="secondary" fullWidth onPress={pickAndUploadVideo} disabled={uploadingVideo} />
              ) : uploadingVideo ? (
                <View style={styles.uploadingRow}>
                  <ActivityIndicator color={color.icon.brand} />
                </View>
              ) : (
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Button label="📹 Record now" variant="secondary" fullWidth onPress={recordAndUploadVideo} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="🎥 Choose existing" variant="secondary" fullWidth onPress={pickAndUploadVideo} />
                  </View>
                </View>
              )}
              <Text role="caption" tone="tertiary" style={styles.center}>
                — or paste a link (YouTube, Vimeo, etc.) —
              </Text>
              <Field placeholder="Video URL (optional)" value={videoUrl} onChangeText={setVideoUrl} autoCapitalize="none" />
              <Button label={submitting ? "Saving…" : editingId ? "Save Changes" : "Save Drill"} fullWidth onPress={submit} disabled={submitting} />
            </Card>
          )}
        </View>
      )}
    </View>
  );

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: "Drill Library" }} />

      <FlatList
        data={visibleDrills}
        keyExtractor={(d) => d.id}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.inset}>
            <EmptyState icon="search" title="No drills found" body="Try a different search or category." />
          </View>
        }
        contentContainerStyle={{ paddingVertical: space[4], gap: space[3] }}
        renderItem={({ item }) => {
          const categoryLabel = item.skill.replace(/_/g, " ");
          return (
            <Card style={[styles.inset, { gap: space[2] }]}>
              <View style={styles.thumb}>
                {item.video_url ? (
                  <Pressable style={styles.thumbInner} onPress={() => setWatchingDrill(item)}>
                    <Ionicons name="play-circle" size={36} color={color.icon.inverse} />
                  </Pressable>
                ) : (
                  <View style={styles.thumbInner}>
                    <Ionicons name="videocam-outline" size={28} color={color.icon.muted} />
                  </View>
                )}
                <Badge label={categoryLabel} tone="brand" style={styles.thumbBadge} />
              </View>

              <Text role="h3">{item.title}</Text>
              <Text tone="secondary">{item.description}</Text>

              <Divider />

              <View style={styles.cardFooter}>
                <Text role="caption" tone="tertiary">
                  {!item.club_id ? "SHARED STARTER LIBRARY" : ""}
                </Text>
                {canEdit(item) && (
                  <View style={styles.footerActions}>
                    <Pressable onPress={() => deleteDrill(item)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={color.icon.danger} />
                    </Pressable>
                    <Pressable onPress={() => startEdit(item)} hitSlop={8}>
                      <Text role="label" tone="brand">Edit Drill →</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </Card>
          );
        }}
      />

      <DrillVideoModal
        visible={!!watchingDrill}
        onClose={() => setWatchingDrill(null)}
        videoUrl={watchingDrill?.video_url ?? null}
        title={watchingDrill?.title}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  inset: { marginHorizontal: space[4] },
  row: { flexDirection: "row", gap: space[3] },
  center: { textAlign: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  uploadingRow: { alignItems: "center", paddingVertical: space[3] },
  infoCallout: {
    flexDirection: "row",
    gap: space[3],
    padding: space[4],
    borderRadius: radius.card,
    backgroundColor: color.bg.brandSubtle,
    alignItems: "flex-start",
  },
  thumb: { height: 140, borderRadius: radius.card, backgroundColor: color.bg.sunken, overflow: "hidden", position: "relative" },
  thumbInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  thumbBadge: { position: "absolute", top: space[2], left: space[2] },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerActions: { flexDirection: "row", alignItems: "center", gap: space[3] },
});
