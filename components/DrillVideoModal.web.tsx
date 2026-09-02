import React, { useEffect, useMemo } from "react";
import { Modal, View, Pressable, StyleSheet, SafeAreaView } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Text } from "@/components/ui";
import { color, space } from "@/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  videoUrl: string | null;
  title?: string;
}

// react-native-webview has no web implementation at all (only
// WebView.ios/.android/.macos/.windows.tsx exist) -- its own fallback
// component just renders the literal text "React Native WebView does not
// support this platform." on any platform without one, web included. A
// plain <iframe> is the actual mechanism YouTube/Vimeo's own embed docs
// recommend for a browser anyway, so this is the real fix, not a workaround.
function getEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&playsinline=1`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
  return null;
}

export default function DrillVideoModal({ visible, onClose, videoUrl, title }: Props) {
  const embedUrl = useMemo(() => (videoUrl ? getEmbedUrl(videoUrl) : null), [videoUrl]);
  const directSource = embedUrl ? null : videoUrl;

  const player = useVideoPlayer(directSource, (p) => {
    p.play();
  });

  useEffect(() => {
    if (!visible) player.pause();
  }, [visible, player]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text role="h3" tone="onSpotlight" numberOfLines={1} style={styles.title}>
            {title ?? "Drill Video"}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
            <Text role="h3" tone="brand">
              Close
            </Text>
          </Pressable>
        </View>
        <View style={styles.playerWrap}>
          {!videoUrl ? null : embedUrl ? (
            <iframe
              src={embedUrl}
              style={{ ...styles.media, border: "none" }}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <VideoView style={styles.media} player={player} allowsPictureInPicture contentFit="contain" />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg.spotlight },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: space[4] },
  title: { flex: 1, marginRight: space[3] },
  playerWrap: { flex: 1, backgroundColor: color.bg.spotlight },
  media: { flex: 1 },
});
