import React, { useState } from "react";
import { View, Image, LayoutAnimation, Platform, UIManager, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useClubBio } from "@/lib/hooks";
import ListState from "@/components/ListState";
import { Card, Text, Button } from "@/components/ui";
import { color, space, radius } from "@/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ClubBioSection() {
  const { crestUrl, bio, loading, error, refresh } = useClubBio();
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <Card style={styles.container}>
      <View style={styles.logoWrap}>
        <View style={styles.logoBadge}>
          {/* A club that hasn't uploaded a crest gets a generic mark, never
              another club's image -- this section used to compile Williams
              Soccer Clinic's crest and founding story directly into shared
              UI, which every club's app would have shown regardless of
              whose account it was. */}
          {crestUrl ? (
            <Image source={{ uri: crestUrl }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Ionicons name="shield-outline" size={48} color={color.icon.inverse} />
          )}
        </View>
      </View>

      <ListState
        loading={loading}
        error={error}
        isEmpty={!loading && !error && !bio}
        onRetry={refresh}
        emptyTitle="No club story yet"
        emptyHint="A director can add one from Club Management."
      >
        <Button label={expanded ? "Show less" : "Read our full story"} variant="ghost" size="sm" onPress={toggleExpanded} />
        {expanded && <Text tone="secondary">{bio}</Text>}
      </ListState>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[3] },
  logoWrap: { alignItems: "center" },
  logoBadge: {
    width: 110,
    height: 110,
    borderRadius: radius.full,
    backgroundColor: color.bg.spotlight,
    alignItems: "center",
    justifyContent: "center",
    padding: space[2],
  },
  logo: { width: 94, height: 94, borderRadius: radius.full },
});
