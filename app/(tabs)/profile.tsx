import React, { useEffect, useState } from "react";
import { View, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { shareText } from "@/lib/shareCompat";
import { confirmAsync, notify } from "@/lib/alertCompat";
import { Screen, Text, Eyebrow, Card, CardHeader, SpotlightCard, Button, Avatar, ListRow, Toggle, Field } from "@/components/ui";
import { color, space, radius, borderWidth } from "@/theme";

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
      const { data, error } = await supabase.from("clubs").select("name, join_code").eq("id", profile.club_id).single();
      if (error) {
        notify("Couldn't load club info", error.message);
        return;
      }
      setClubName(data?.name ?? null);
      setJoinCode(data?.join_code ?? null);
    })();
  }, [profile?.club_id, profile?.role]);

  const setNotifyPref = async (key: "notify_events" | "notify_announcements", value: boolean) => {
    if (!profile?.id) return;
    const { error } = await supabase
      .from("profiles")
      .update({ [key]: value })
      .eq("id", profile.id);
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
      "Delete account",
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

  const roleLabel = profile?.role ? profile.role[0].toUpperCase() + profile.role.slice(1) : "";
  const hasAdminRows = profile?.role === "director" || profile?.role === "parent" || canManageDrills;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          style={styles.avatarWrap}
          onPress={canManageDrills ? pickAndUploadPhoto : undefined}
          disabled={uploadingPhoto}
          accessibilityRole={canManageDrills ? "button" : undefined}
          accessibilityLabel={canManageDrills ? "Change profile photo" : undefined}
        >
          <Avatar uri={profile?.avatar_url} name={profile?.full_name ?? "?"} size={80} />
          {canManageDrills && (
            <View style={styles.avatarBadge}>
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color={color.icon.inverse} />
              ) : (
                <Ionicons name="camera" size={14} color={color.icon.inverse} />
              )}
            </View>
          )}
        </Pressable>
        <Text role="h1">{profile?.full_name}</Text>
        <Eyebrow tone="brand">{roleLabel}</Eyebrow>
      </View>

      {canManageDrills && (
        <Card style={styles.section}>
          <CardHeader
            title="Meet the Coach Bio"
            action={editingBio ? "Cancel" : profile?.coach_bio ? "Edit" : "Add"}
            onAction={() => setEditingBio((v) => !v)}
          />

          {editingBio ? (
            <>
              <Field placeholder="Title, e.g. Head Trainer" value={coachTitle} onChangeText={setCoachTitle} />
              <Field
                placeholder="A couple sentences parents will see on the home screen — background, coaching philosophy, what you focus on."
                value={coachBio}
                onChangeText={setCoachBio}
                multiline
              />
              <Button label={savingBio ? "Saving…" : "Save"} onPress={saveBio} disabled={savingBio} fullWidth />
            </>
          ) : profile?.coach_bio ? (
            <>
              <Eyebrow tone="brand">{profile.coach_title || (profile.role === "director" ? "Director" : "Coach")}</Eyebrow>
              <Text tone="secondary">{profile.coach_bio}</Text>
            </>
          ) : (
            <Text tone="tertiary">Not set yet — you'll show up with just your name until you add a title and bio.</Text>
          )}
        </Card>
      )}

      {joinCode && (
        <SpotlightCard style={styles.codeCard}>
          <Eyebrow tone="onSpotlightMuted">Invite code for {clubName?.toUpperCase()}</Eyebrow>
          <Text role="display" tone="onSpotlight" style={styles.codeValue}>
            {joinCode}
          </Text>
          <Text tone="onSpotlightMuted" style={styles.codeHint}>
            Share this club code with adult members. Parents still link each child with a separate player code.
          </Text>
          <Button label="Share Club Code" onPress={() => shareText(`Join ${clubName} on ClubHQ! Use club invite code: ${joinCode}`)} />
        </SpotlightCard>
      )}

      {hasAdminRows && (
        <Card style={styles.list}>
          <Eyebrow>Administration</Eyebrow>
          {profile?.role === "director" && (
            <ListRow icon="business" title="Club Management" onPress={() => router.push("/club-management")} />
          )}
          {profile?.role === "parent" && <ListRow icon="link" title="Link a Player" onPress={() => router.push("/claim-player")} />}
          {canManageDrills && <ListRow icon="film" title="Manage Drill Library" onPress={() => router.push("/manage-drills")} />}
          {canManageDrills && <ListRow icon="bulb" title="Director Copilot" onPress={() => router.push("/(tabs)/copilot")} />}
          {profile?.role === "director" && (
            <ListRow icon="stats-chart" title="Pilot Metrics" onPress={() => router.push("/pilot-metrics")} />
          )}
        </Card>
      )}

      <Card style={styles.list}>
        <Eyebrow>Settings &amp; Safety</Eyebrow>
        <Toggle
          label="Event notifications"
          value={profile?.notify_events ?? true}
          onValueChange={(v) => setNotifyPref("notify_events", v)}
        />
        <Toggle
          label="Announcement notifications"
          value={profile?.notify_announcements ?? true}
          onValueChange={(v) => setNotifyPref("notify_announcements", v)}
        />
        <ListRow title="Terms of Service" onPress={() => router.push("/legal/terms")} />
        <ListRow title="Privacy Policy" onPress={() => router.push("/legal/privacy")} />
      </Card>

      <Button label="Sign Out" variant="danger" fullWidth onPress={() => supabase.auth.signOut()} />

      <Pressable
        style={styles.deleteLink}
        accessibilityRole="button"
        accessibilityLabel="Delete my account"
        onPress={deleteAccount}
        disabled={deleting}
      >
        <Text role="caption" tone="tertiary">
          {deleting ? "Deleting…" : "Delete My Account"}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", gap: space[2] },
  avatarWrap: { position: "relative" },
  avatarBadge: {
    position: "absolute",
    bottom: 0,
    right: -2,
    width: space[6],
    height: space[6],
    borderRadius: radius.full,
    backgroundColor: color.bg.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borderWidth.thin,
    borderColor: color.bg.page,
  },
  section: { gap: space[3] },
  list: { gap: space[1] },
  codeCard: { alignItems: "center", gap: space[2] },
  codeValue: { letterSpacing: 4 },
  codeHint: { textAlign: "center" },
  deleteLink: { alignSelf: "center", paddingVertical: space[2] },
});
