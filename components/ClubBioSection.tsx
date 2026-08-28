import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Swap these with your actual asset paths / remote URLs
const CREST_LOGO = require('../assets/images/williams-crest.png');

const FULL_BIO =
  'Every crest tells you what a club values before a single word does. Ours is built ' +
  'around a ball made of stars, because that’s what we’re here to find, and what ' +
  'we’re here to build.\n\n' +
  'Williams Soccer Clinic was founded by twin brothers who saw a gap between ' +
  'rec league soccer and the level players actually need to get seen, get better, ' +
  'and get recruited. So we built the training ground we wished we’d had: ' +
  'private, individualized, and relentlessly focused on the details that separate ' +
  'a good player from a great one.\n\n' +
  'Across our Dunwoody, Snellville, and Stone Mountain locations, we work with ' +
  'players one on one and in small groups, building technical foundations, ' +
  'tactical intelligence, and the competitive mentality the game demands at its ' +
  'highest levels.\n\n' +
  'We’re young by design, not by accident. Every session, every evaluation, ' +
  'every rep is building toward one standard: players who carry themselves, ' +
  'and play, like they belong on a bigger stage.';

export default function ClubBioSection() {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.container}>
      {/* Crest logo */}
      <View style={styles.logoWrap}>
        <Image source={CREST_LOGO} style={styles.logo} resizeMode="contain" />
      </View>

      {/* Expand / collapse full story */}
      <Pressable onPress={toggleExpanded} hitSlop={8}>
        <Text style={styles.expandLink}>
          {expanded ? 'Show less' : 'Read our full story'}
        </Text>
      </Pressable>

      {expanded && <Text style={styles.fullBioText}>{FULL_BIO}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  logo: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  expandLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A6CFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  fullBioText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#B5B8BE',
    marginTop: 4,
  },
});
