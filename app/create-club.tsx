import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { notify } from "@/lib/alertCompat";
import { Screen, Card, Text, Field, Button, SegmentedControl, StepDots } from "@/components/ui";
import { space, radius, elevation, layout } from "@/theme";

export default function CreateOrJoinClub() {
  const { profile, refreshProfile } = useAuth();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [clubName, setClubName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [working, setWorking] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [codeError, setCodeError] = useState<string | undefined>();

  const createClub = async () => {
    if (!clubName.trim()) {
      setNameError("Give your club a name.");
      return;
    }
    setNameError(undefined);
    setWorking(true);
    // Runs server-side (SECURITY DEFINER) — this is the only way an account
    // becomes a director. Nothing about role is trusted from the client.
    const { error } = await supabase.rpc("create_club", { club_name: clubName.trim() });
    setWorking(false);
    if (error) {
      notify("Couldn't create club", error.message);
      return;
    }
    await refreshProfile();
    router.replace("/(tabs)/dashboard");
  };

  const joinClub = async () => {
    if (!joinCode.trim()) {
      setCodeError("Enter the invite code your director shared with you.");
      return;
    }
    setCodeError(undefined);
    setWorking(true);
    const { error } = await supabase.rpc("join_club", { code: joinCode.trim().toLowerCase() });
    setWorking(false);
    if (error) {
      notify("Couldn't join club", error.message);
      return;
    }
    await refreshProfile();
    // A parent joining still needs a second, separate code to link their
    // child (kept separate deliberately — that's a distinct parental-consent
    // step, not just club membership). Chaining straight into that screen
    // instead of the dashboard makes it read as one flow instead of a
    // confusing empty dashboard followed by a surprise second code.
    router.replace(profile?.role === "parent" ? "/claim-player" : "/(tabs)/dashboard");
  };

  return (
    <Screen scroll={false} style={styles.page}>
      <View style={styles.content}>
        <Text role="display" tone="brand" style={styles.center}>
          One more step
        </Text>
        <Text tone="secondary" style={[styles.center, styles.subtitle]}>
          Every account belongs to a club. Create a new one, or join with an invite code from your director.
        </Text>

        <Card style={styles.card}>
          <SegmentedControl
            options={["Create a Club", "Join with Code"]}
            value={mode === "create" ? "Create a Club" : "Join with Code"}
            onChange={(v) => setMode(v === "Create a Club" ? "create" : "join")}
          />

          {mode === "create" ? (
            <>
              <Text role="bodySm" tone="secondary" style={styles.center}>
                Creating a club makes you its director.
              </Text>
              <Field
                placeholder="Club name"
                value={clubName}
                onChangeText={(v) => {
                  setClubName(v);
                  if (nameError) setNameError(undefined);
                }}
                error={nameError}
              />
              <View style={styles.glow}>
                <Button label={working ? "Creating…" : "Create Club"} size="lg" onPress={createClub} disabled={working} fullWidth />
              </View>
            </>
          ) : (
            <>
              <Text role="bodySm" tone="secondary" style={styles.center}>
                Your director can find their club's invite code in Profile.
              </Text>
              {profile?.role === "parent" && (
                <Text role="bodySm" tone="secondary" style={styles.center}>
                  Right after this, you'll link your child with a separate one-time code from your director — that's a deliberate second
                  step, not a mistake.
                </Text>
              )}
              <Field
                placeholder="Invite code"
                value={joinCode}
                onChangeText={(v) => {
                  setJoinCode(v);
                  if (codeError) setCodeError(undefined);
                }}
                autoCapitalize="none"
                error={codeError}
              />
              <View style={styles.glow}>
                <Button label={working ? "Joining…" : "Join Club"} onPress={joinClub} disabled={working} size="lg" fullWidth />
              </View>
            </>
          )}
        </Card>

        <StepDots count={2} active={0} style={styles.stepDots} />
      </View>
    </Screen>
  );
}

// Proportions measured off mockup 00 (375x840): card 325 wide inset 25 each
// side, 32 inner padding, button 261 — and 325 - 2*32 == 261 confirms the
// reading. Expressed as scale steps (24 inset, 32 padding) rather than the
// pixel widths that were here before: those were tuned to one screen width and
// pinned the card to 340px, so it floated undersized on anything wider.
const styles = StyleSheet.create({
  page: { justifyContent: "center", paddingHorizontal: space[6] },
  content: { width: "100%", maxWidth: layout.maxContent, alignSelf: "center" },
  center: { textAlign: "center" },
  subtitle: { marginTop: space[3] },
  card: { marginTop: space[8], gap: space[5], padding: space[7] },
  glow: { borderRadius: radius.button, ...elevation.brandGlow },
  stepDots: { marginTop: space[6] },
});
