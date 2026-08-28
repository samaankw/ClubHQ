import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { confirmAsync, notify } from "@/lib/alertCompat";
import { Drill } from "@/types/db";
import DrillVideoModal from "@/components/DrillVideoModal";

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

  const canManageDrills = profile?.role === "coach" || profile?.role === "director";

  const canEdit = (drill: Drill) =>
    canManageDrills && !!drill.club_id && (profile?.role === "director" || drill.added_by === profile?.id);

  const resetForm = () => {
    setEditingId(null);
    setSkill("first_touch");
    setTitle("");
    setDescription("");
    setVideoUrl("");
  };

  const startEdit = (drill: Drill) => {
    setEditingId(drill.id);
    setSkill(drill.skill);
    setTitle(drill.title);
    setDescription(drill.description);
    setVideoUrl(drill.video_url ?? "");
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
    if (!title.trim() || !description.trim() || !profile?.club_id) {
      notify("Missing info", "Add at least a title and description.");
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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Drill Library" }} />
      <Text style={styles.intro}>
        {canManageDrills
          ? "The AI only assigns homework from this library — add your own videos here so it always points players to something you've vetted."
          : "The AI only assigns homework from this vetted library — coaches and directors keep it up to date."}
      </Text>

      {canManageDrills && (
        <>
          <Pressable
            style={styles.addButton}
            onPress={() => {
              if (showForm) resetForm();
              setShowForm((s) => !s);
            }}
          >
            <Text style={styles.addButtonText}>{showForm ? "Cancel" : "+ Add a Drill"}</Text>
          </Pressable>

          {showForm && (
            <ScrollView style={styles.form}>
              {editingId && <Text style={styles.editingLabel}>Editing drill</Text>}
              <View style={styles.chipRow}>
                {SKILLS.map((s) => (
                  <Pressable key={s.key} style={[styles.chip, skill === s.key && styles.chipActive]} onPress={() => setSkill(s.key)}>
                    <Text style={[styles.chipText, skill === s.key && styles.chipTextActive]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={styles.input} placeholder="Drill title" placeholderTextColor="#6B6F76" value={title} onChangeText={setTitle} />
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Instructions a parent/player can follow"
                placeholderTextColor="#6B6F76"
                value={description}
                onChangeText={setDescription}
                multiline
              />
              {videoUrl ? (
                <Pressable style={styles.uploadButton} onPress={pickAndUploadVideo} disabled={uploadingVideo}>
                  <Text style={styles.uploadButtonText}>Video uploaded ✓ — replace it</Text>
                </Pressable>
              ) : uploadingVideo ? (
                <View style={styles.uploadButton}><ActivityIndicator color="#0A6CFF" /></View>
              ) : (
                <View style={styles.uploadRow}>
                  <Pressable style={[styles.uploadButton, styles.uploadButtonHalf]} onPress={recordAndUploadVideo}>
                    <Text style={styles.uploadButtonText}>📹 Record now</Text>
                  </Pressable>
                  <Pressable style={[styles.uploadButton, styles.uploadButtonHalf]} onPress={pickAndUploadVideo}>
                    <Text style={styles.uploadButtonText}>🎥 Choose existing</Text>
                  </Pressable>
                </View>
              )}
              <Text style={styles.orDivider}>— or paste a link (YouTube, Vimeo, etc.) —</Text>
              <TextInput style={styles.input} placeholder="Video URL (optional)" placeholderTextColor="#6B6F76" value={videoUrl} onChangeText={setVideoUrl} autoCapitalize="none" />
              <Pressable style={styles.submitButton} onPress={submit} disabled={submitting}>
                <Text style={styles.submitButtonText}>{submitting ? "Saving…" : editingId ? "Save Changes" : "Save Drill"}</Text>
              </Pressable>
            </ScrollView>
          )}
        </>
      )}

      <FlatList
        data={drills}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ paddingTop: 8 }}
        renderItem={({ item }) => (
          <View style={styles.drillCard}>
            <View style={styles.drillHeaderRow}>
              <Text style={styles.drillSkill}>{item.skill.replace(/_/g, " ")}</Text>
              {canEdit(item) && (
                <View style={styles.drillActions}>
                  <Pressable onPress={() => startEdit(item)}><Text style={styles.drillActionText}>Edit</Text></Pressable>
                  <Pressable onPress={() => deleteDrill(item)}><Text style={[styles.drillActionText, styles.drillActionTextDanger]}>Delete</Text></Pressable>
                </View>
              )}
            </View>
            <Text style={styles.drillTitle}>{item.title}</Text>
            <Text style={styles.drillDesc}>{item.description}</Text>
            {!item.club_id && <Text style={styles.sharedTag}>Shared starter library</Text>}
            {item.video_url && (
              <Pressable style={styles.watchButton} onPress={() => setWatchingDrill(item)}>
                <Text style={styles.watchButtonText}>▶ Watch</Text>
              </Pressable>
            )}
          </View>
        )}
      />

      <DrillVideoModal
        visible={!!watchingDrill}
        onClose={() => setWatchingDrill(null)}
        videoUrl={watchingDrill?.video_url ?? null}
        title={watchingDrill?.title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0D", padding: 16 },
  intro: { fontSize: 13, color: "#9A9DA3", marginBottom: 14, lineHeight: 18 },
  addButton: { backgroundColor: "#0A6CFF", borderRadius: 10, padding: 14, alignItems: "center", marginBottom: 14 },
  addButtonText: { color: "#fff", fontWeight: "700" },
  form: { backgroundColor: "#141416", borderRadius: 12, padding: 14, marginBottom: 16, maxHeight: 420 },
  uploadRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  uploadButton: { flex: 1, borderWidth: 1.5, borderColor: "#0A6CFF", borderStyle: "dashed", borderRadius: 10, padding: 14, alignItems: "center", marginBottom: 6 },
  uploadButtonHalf: { marginBottom: 0 },
  uploadButtonText: { color: "#0A6CFF", fontWeight: "700", fontSize: 14, textAlign: "center" },
  orDivider: { textAlign: "center", color: "#6B6F76", fontSize: 12, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: "#0A6CFF" },
  chipActive: { backgroundColor: "#0A6CFF" },
  chipText: { color: "#0A6CFF", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#242424", borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 15, color: "#F2F2F3", backgroundColor: "#0B0B0D" },
  textarea: { height: 80, textAlignVertical: "top" },
  submitButton: { backgroundColor: "#0A6CFF", borderRadius: 10, padding: 14, alignItems: "center" },
  submitButtonText: { color: "#fff", fontWeight: "700" },
  drillCard: { backgroundColor: "#141416", borderRadius: 12, padding: 14, marginBottom: 8 },
  drillHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  drillSkill: { fontSize: 11, fontWeight: "700", color: "#0A6CFF", textTransform: "uppercase" },
  drillActions: { flexDirection: "row", gap: 14 },
  drillActionText: { fontSize: 12, fontWeight: "700", color: "#0A6CFF" },
  drillActionTextDanger: { color: "#FF6B6B" },
  editingLabel: { fontSize: 11, fontWeight: "800", color: "#9A9DA3", letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" },
  drillTitle: { fontSize: 15, fontWeight: "700", color: "#F2F2F3", marginTop: 2 },
  drillDesc: { fontSize: 13, color: "#9A9DA3", marginTop: 4 },
  sharedTag: { fontSize: 11, color: "#6B6F76", marginTop: 6, fontStyle: "italic" },
  watchButton: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#17181B", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  watchButtonText: { color: "#0A6CFF", fontWeight: "700", fontSize: 13 },
});
