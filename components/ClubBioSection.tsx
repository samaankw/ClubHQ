import React, { useState } from "react";
import { View, Image, LayoutAnimation, Platform, UIManager, StyleSheet } from "react-native";
import { Card, Text, Button } from "@/components/ui";
import { color, space, radius } from "@/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Swap these with your actual asset paths / remote URLs
const CREST_LOGO = require("../assets/images/williams-crest.png");

const FULL_BIO =
  "Every crest tells you what a club values before a single word does. Ours is built " +
  "around a ball made of stars, because that’s what we’re here to find, and what " +
  "we’re here to build.\n\n" +
  "Williams Soccer Clinic was founded by twin brothers who saw a gap between " +
  "rec league soccer and the level players actually need to get seen, get better, " +
  "and get recruited. So we built the training ground we wished we’d had: " +
  "private, individualized, and relentlessly focused on the details that separate " +
  "a good player from a great one.\n\n" +
  "Across our Dunwoody, Snellville, and Stone Mountain locations, we work with " +
  "players one on one and in small groups, building technical foundations, " +
  "tactical intelligence, and the competitive mentality the game demands at its " +
  "highest levels.\n\n" +
  "We’re young by design, not by accident. Every session, every evaluation, " +
  "every rep is building toward one standard: players who carry themselves, " +
  "and play, like they belong on a bigger stage.";

export default function ClubBioSection() {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <Card style={styles.container}>
      {/* The crest asset is an opaque, near-black PNG with no transparency —
          rendering it directly on the light page ground makes it look like a
          rendering bug rather than a mark. Framing it on a dark badge (the
          same spotlight surface used elsewhere for emphasis) makes the dark
          disc a deliberate design choice instead. The asset itself should be
          re-exported with a transparent background. */}
      <View style={styles.logoWrap}>
        <View style={styles.logoBadge}>
          <Image source={CREST_LOGO} style={styles.logo} resizeMode="contain" />
        </View>
      </View>

      <Button
        label={expanded ? "Show less" : "Read our full story"}
        variant="ghost"
        size="sm"
        onPress={toggleExpanded}
      />

      {expanded && <Text tone="secondary">{FULL_BIO}</Text>}
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
