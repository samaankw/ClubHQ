import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { shareText } from "@/lib/shareCompat";
import { confirmAsync, notify } from "@/lib/alertCompat";
import { Screen, Text, Eyebrow, Card, Button } from "@/components/ui";
import { space } from "@/theme";

type LinkedPlayer = {
  id: string;
  full_name: string;
};

export default function PrivacyCenter() {
  const { profile } = useAuth();
  const [players, setPlayers] = useState<LinkedPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role !== "parent" || !profile.id) {
      setPlayers([]);
      return;
    }

    let active = true;
    setLoadingPlayers(true);
    void supabase
      .from("players")
      .select("id, full_name")
      .eq("parent_id", profile.id)
      .order("full_name")
      .then(({ data, error }) => {
        if (!active) return;
        setLoadingPlayers(false);
        if (error) {
          notify("Couldn't load linked players", error.message);
          return;
        }
        setPlayers((data as LinkedPlayer[] | null) ?? []);
      });

    return () => {
      active = false;
    };
  }, [profile?.id, profile?.role]);

  const exportMyData = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-my-data");
      if (error) throw error;
      await shareText(JSON.stringify(data, null, 2));
    } catch (error) {
      notify("Export failed", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setExporting(false);
    }
  };

  const withdrawConsent = async (player: LinkedPlayer) => {
    const ok = await confirmAsync(
      `Withdraw consent for ${player.full_name}?`,
      "This removes your parent link immediately, so you will no longer see this player's ClubHQ development data. The club record is not deleted by this action.",
      "Withdraw consent",
    );
    if (!ok) return;

    setWithdrawingId(player.id);
    try {
      const { error } = await supabase.functions.invoke("withdraw-parental-consent", {
        body: { playerId: player.id },
      });
      if (error) throw error;
      setPlayers((current) => current.filter((item) => item.id !== player.id));
      notify(
        "Consent withdrawn",
        "Your parent link has been removed. This withdrawal is retained in the consent history for accountability.",
      );
    } catch (error) {
      notify("Couldn't withdraw consent", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setWithdrawingId(null);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Privacy & Data" }} />

      <View style={styles.intro}>
        <Text role="h1">Privacy &amp; Data</Text>
        <Text tone="secondary">
          Export a copy of your ClubHQ data, review the retention approach, or withdraw parental consent for a currently linked player.
        </Text>
      </View>

      <Card style={styles.section}>
        <Eyebrow tone="brand">Your data</Eyebrow>
        <Text role="h2">Downloadable account export</Text>
        <Text tone="secondary">
          The export contains your account/profile information, consent history, records you authored, and currently linked child records when
          you are a parent. It does not grant access to data you are no longer authorized to view.
        </Text>
        <Button label={exporting ? "Preparing export…" : "Export My Data"} onPress={exportMyData} disabled={exporting} fullWidth />
      </Card>

      {profile?.role === "parent" && (
        <Card style={styles.section}>
          <Eyebrow tone="brand">Parental consent</Eyebrow>
          <Text role="h2">Linked players</Text>
          <Text tone="secondary">
            Withdrawing consent removes your parent-player link immediately. It does not by itself delete the club's player record. If you
            want the player record deleted, use Delete Player Data before withdrawing or contact ClubHQ/your club for the applicable request
            process.
          </Text>

          {loadingPlayers ? (
            <Text tone="tertiary">Loading linked players…</Text>
          ) : players.length === 0 ? (
            <Text tone="tertiary">No players are currently linked to this parent account.</Text>
          ) : (
            players.map((player) => (
              <View key={player.id} style={styles.playerRow}>
                <View style={{ flex: 1 }}>
                  <Text role="h3">{player.full_name}</Text>
                  <Text role="caption" tone="tertiary">
                    Currently linked
                  </Text>
                </View>
                <Button
                  label={withdrawingId === player.id ? "Withdrawing…" : "Withdraw"}
                  variant="danger"
                  size="sm"
                  onPress={() => withdrawConsent(player)}
                  disabled={withdrawingId !== null}
                />
              </View>
            ))
          )}
        </Card>
      )}

      <Card style={styles.section}>
        <Eyebrow tone="brand">Retention</Eyebrow>
        <Text role="h2">Purpose-based retention</Text>
        <Text tone="secondary">
          ClubHQ's pre-launch retention schedule uses limited operational windows by record type, with shorter deletion when appropriate and
          documented exceptions for legal holds, safety investigations, contracts, backups, or other approved obligations. The detailed
          schedule remains subject to attorney review before public launch.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space[2] },
  section: { gap: space[3] },
  playerRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
});
