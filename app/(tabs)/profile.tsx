import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Image, ActivityIndicator, Switch } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { shareText } from "@/lib/shareCompat";
import { confirmAsync, notify } from "@/lib/alertCompat";

async function uploadAvatarPhoto(userId: string, localUri: string): Promise<string> {
  const extMatch = /\.(\w+)$/.exec(localUri);
  const ext = extMatch ? extMatch[1] : "jpg";
  const path = `coach-photos/${userId}/${Date.now()}.${ext}`;

  const response = await fetch(localUri);
  const bytes = await response.arrayBuffer();

  const { error } = await supabase.storage.from("club-media").upload(path, bytes, {
    contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("club-media").getPublicUrl(path);
  return data.publicUrl;
}

export default function Profile() {
  const { profile, refreshProfile } = useAuth();
  const canManageDrills = profile?.role === "coach" || profile?.role === "director";
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [clubName, setClubName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editingBio, setEditingBio] = useState(false);
  const [coachTitle, setCoachTitle] = useState("");
  const [coachBio, setCoachBio] = useState("");
  const [savingBio, setSavingBio] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const pickAndUploadPhoto = async () => {
    if (!profile?.id) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify("Permission needed", "Allow photo library access to set a profile photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setUploadingPhoto(true);
    try {
      const publicUrl = await uploadAvatarPhoto(profile.id, result.assets[0].uri);
      const { error } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", profile.id);
      if (error) throw error;
      await refreshProfile();
    } catch (err) {
      notify("Upload failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  useEffect(() => {
    setCoachTitle(profile?.coach_title ?? "");
    setCoachBio(profile?.coach_bio ?? "");
  }, [profile?.coach_title, profile?.coach_bio]);

  const saveBio = async () => {
    if (!profile?.id) return;
    setSavingBio(true);
    let { error } = await supabase
      .from("profiles")
      .update({ coach_title: coachTitle.trim() || null, coach_bio: coachBio.trim() || null })
      .eq("id", profile.id);

    // Same stale-token retry as loadProfile: a token that fails the DB's
    // JWT check can otherwise make this look like a silent no-op save.
    if (error && /jwt/i.test(error.message)) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError) {
        ({ error } = await supabase
          .from("profiles")
          .update({ coach_title: coachTitle.trim() || null, coach_bio: coachBio.trim() || null })
          .eq("id", profile.id));
      }
    }

    setSavingBio(false);
    if (error) return notify("Couldn't save", error.message);
    await refreshProfile();
    setEditingBio(false);
  };

  useEffect(() => {
    (async () => {
      if (!profile?.club_id || profile.role !== "director") return;
      const { data } = await supabase.from("clubs").select("name, join_code").eq("id", profile.club_id).single();
      setClubName(data?.name ?? null);
      setJoinCode(data?.join_code ?? null);
    })();
  }, [profile?.club_id, profile?.role]);

  const setNotifyPref = async (key: "notify_events" | "notify_announcements", value: boolean) => {
    if (!profile?.id) return;
    const { error } = await supabase.from("profiles").update({ [key]: value }).eq("id", profile.id);
    if (error) {
      notify("Couldn't update", error.message);
      return;
    }
    await refreshProfile();
  };

  const deleteAccount = async () => {
    const ok = await confirmAsync(
      "Delete your ClubHQ account?",
      "This permanently deletes your adult account. If you're a director, transfer club ownership before deleting. This cannot be undone.",
      "Delete account"
    );
    if (!ok) return;
    setDeleting(true);
    const { error } = await supabase.functions.invoke("delete-account");
    setDeleting(false);
    if (error) {
      notify("Couldn't delete account", error.message);
      return;
    }
    await supabase.auth.signOut();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={canManageDrills ? pickAndUploadPhoto : undefined} disabled={uploadingPhoto}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.full_name?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
        )}
        {canManageDrills && (
          <View style={styles.avatarEditBadge}>
            {uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.avatarEditBadgeText}>📷</Text>}
          </View>
        )}
      </Pressable>
      <Text style={styles.name}>{profile?.full_name}</Text>
      <Text style={styles.role}>{profile?.role ? profile.role[0].toUpperCase() + profile.role.slice(1) : ""}</Text>

      {canManageDrills && (
        <View style={styles.bioCard}>
          <View style={styles.bioHeaderRow}>
            <Text style={styles.codeLabel}>MY "MEET THE COACHES" BIO</Text>
            <Pressable onPress={() => setEditingBio((v) => !v)}>
              <Text style={styles.editLink}>{editingBio ? "Cancel" : profile?.coach_bio ? "Edit" : "Add"}</Text>
            </Pressable>
          </View>

          {editingBio ? (
            <>
              <TextInput
                style={styles.bioInput}
                placeholder="Title, e.g. Head Trainer"
                placeholderTextColor="#6B6F76"
                value={coachTitle}
                onChangeText={setCoachTitle}
              />
              <TextInput
                style={[styles.bioInput, styles.bioTextarea]}
                placeholder="A couple sentences parents will see on the home screen — background, coaching philosophy, what you focus on."
                placeholderTextColor="#6B6F76"
                value={coachBio}
                onChangeText={setCoachBio}
                multiline
              />
              <Pressable style={styles.shareButton} onPress={saveBio} disabled={savingBio}>
                <Text style={styles.shareButtonText}>{savingBio ? "Saving…" : "Save"}</Text>
              </Pressable>
            </>
          ) : profile?.coach_bio ? (
            <>
              <Text style={styles.bioPreviewTitle}>{profile.coach_title || (profile.role === "director" ? "Director" : "Coach")}</Text>
              <Text style={styles.bioPreviewText}>{profile.coach_bio}</Text>
            </>
          ) : (
            <Text style={styles.codeHint}>Not set yet — you'll show up with just your name until you add a title and bio.</Text>
          )}
        </View>
      )}

      {joinCode && (
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>INVITE CODE FOR {clubName?.toUpperCase()}</Text>
          <Text style={styles.codeValue}>{joinCode}</Text>
          <Text style={styles.codeHint}>Share this club code with adult members. Parents still link each child with a separate player code.</Text>
          <Pressable style={styles.shareButton} onPress={() => shareText(`Join ${clubName} on ClubHQ! Use club invite code: ${joinCode}`)}>
            <Text style={styles.shareButtonText}>Share Club Code</Text>
          </Pressable>
        </View>
      )}

      {profile?.role === "director" && (
        <Pressable style={styles.menuButton} onPress={() => router.push("/club-management")}>
          <Text style={styles.menuButtonText}>🏟️ Club Management</Text>
        </Pressable>
      )}

      {profile?.role === "parent" && (
        <Pressable style={styles.menuButton} onPress={() => router.push("/claim-player")}>
          <Text style={styles.menuButtonText}>🔗 Link a Player</Text>
        </Pressable>
      )}

      {canManageDrills && (
        <Pressable style={styles.menuButton} onPress={() => router.push("/manage-drills")}>
          <Text style={styles.menuButtonText}>🎬 Manage Drill Library</Text>
        </Pressable>
      )}

      {canManageDrills && (
        <Pressable style={styles.menuButton} onPress={() => router.push("/(tabs)/copilot")}>
          <Text style={styles.menuButtonText}>💡 Director Copilot</Text>
        </Pressable>
      )}

      {profile?.role === "director" && (
        <Pressable style={styles.menuButton} onPress={() => router.push("/pilot-metrics")}>
          <Text style={styles.menuButtonText}>📊 Pilot Metrics</Text>
        </Pressable>
      )}

      <View style={styles.bioCard}>
        <Text style={styles.codeLabel}>NOTIFICATIONS</Text>
        <View style={styles.notifRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.notifRowTitle}>Events</Text>
            <Text style={styles.notifRowHint}>New and updated practices, games, tournaments</Text>
          </View>
          <Switch
            value={profile?.notify_events ?? true}
            onValueChange={(v) => setNotifyPref("notify_events", v)}
            trackColor={{ true: "#0A6CFF" }}
          />
        </View>
        <View style={styles.notifRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.notifRowTitle}>Announcements</Text>
            <Text style={styles.notifRowHint}>Posts from coaches and directors</Text>
          </View>
          <Switch
            value={profile?.notify_announcements ?? true}
            onValueChange={(v) => setNotifyPref("notify_announcements", v)}
            trackColor={{ true: "#0A6CFF" }}
          />
        </View>
      </View>

      <Pressable style={styles.menuButton} onPress={() => router.push("/legal/terms")}>
        <Text style={styles.menuButtonText}>📄 Terms of Service</Text>
      </Pressable>
      <Pressable style={styles.menuButton} onPress={() => router.push("/legal/privacy")}>
        <Text style={styles.menuButtonText}>🔒 Privacy Policy</Text>
      </Pressable>

      <Pressable style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Pressable style={styles.deleteButton} onPress={deleteAccount} disabled={deleting}>
        <Text style={styles.deleteText}>{deleting ? "Deleting…" : "Delete My Account"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingTop: 60, backgroundColor: "#0B0B0D", paddingHorizontal: 24, paddingBottom: 50 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#0A6CFF", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarText: { color: "#fff", fontSize: 32, fontWeight: "800" },
  avatarEditBadge: {
    position: "absolute", bottom: 8, right: -2, width: 26, height: 26, borderRadius: 13,
    backgroundColor: "#0A6CFF", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#0B0B0D",
  },
  avatarEditBadgeText: { fontSize: 12 },
  name: { fontSize: 20, fontWeight: "700", color: "#F2F2F3" },
  role: { fontSize: 14, color: "#9A9DA3", marginTop: 4, marginBottom: 20 },
  bioCard: { backgroundColor: "#141416", borderRadius: 14, padding: 16, marginBottom: 16, width: "100%" },
  bioHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  editLink: { color: "#0A6CFF", fontWeight: "700", fontSize: 13 },
  bioInput: { borderWidth: 1, borderColor: "#242424", borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14, color: "#F2F2F3", backgroundColor: "#0B0B0D" },
  bioTextarea: { height: 90, textAlignVertical: "top" },
  bioPreviewTitle: { fontSize: 12, fontWeight: "700", color: "#0A6CFF", textTransform: "uppercase", letterSpacing: 0.3 },
  bioPreviewText: { fontSize: 14, color: "#B5B8BE", marginTop: 6, lineHeight: 20 },
  notifRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 12 },
  notifRowTitle: { fontSize: 14, fontWeight: "700", color: "#F2F2F3" },
  notifRowHint: { fontSize: 12, color: "#9A9DA3", marginTop: 2 },
  codeCard: { backgroundColor: "#141416", borderRadius: 14, padding: 18, alignItems: "center", marginBottom: 20, width: "100%" },
  codeLabel: { fontSize: 11, fontWeight: "700", color: "#9A9DA3", letterSpacing: 0.5 },
  codeValue: { fontSize: 28, fontWeight: "800", color: "#0A6CFF", letterSpacing: 2, marginTop: 6 },
  codeHint: { fontSize: 12, color: "#9A9DA3", marginTop: 8, textAlign: "center" },
  shareButton: { backgroundColor: "#0A6CFF", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 20, marginTop: 12 },
  shareButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  menuButton: { backgroundColor: "#17181B", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginBottom: 12, width: "100%", alignItems: "center" },
  menuButtonText: { color: "#0A6CFF", fontWeight: "700" },
  signOutButton: { borderWidth: 1, borderColor: "#0A6CFF", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32, marginTop: 6 },
  signOutText: { color: "#0A6CFF", fontWeight: "700" },
  deleteButton: { paddingVertical: 14, paddingHorizontal: 20, marginTop: 10 },
  deleteText: { color: "#FF6B6B", fontWeight: "700", fontSize: 13 },
});
