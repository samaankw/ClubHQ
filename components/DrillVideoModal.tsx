import React, { useEffect, useMemo } from "react";
import { Modal, View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { WebView } from "react-native-webview";

interface Props {
  visible: boolean;
  onClose: () => void;
  videoUrl: string | null;
  title?: string;
}

// A pasted YouTube/Vimeo link is a webpage, not a raw video file — a native
// player can't open it directly. Route those through their official embed
// player in a WebView instead, so they still play inside the app rather than
// bouncing out to Safari/the YouTube app. Anything else (e.g. a file
// uploaded straight to the club-media bucket) is a real video file and gets
// the native player.
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

  // Stop playback (and any audio) the moment the modal closes.
  useEffect(() => {
    if (!visible) player.pause();
  }, [visible, player]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{title ?? "Drill Video"}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <View style={styles.playerWrap}>
          {!videoUrl ? null : embedUrl ? (
            <WebView
              source={{ uri: embedUrl }}
              style={styles.media}
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
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
  container: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  title: { flex: 1, color: "#F2F2F3", fontSize: 16, fontWeight: "700", marginRight: 12 },
  closeText: { color: "#0A6CFF", fontWeight: "700", fontSize: 15 },
  playerWrap: { flex: 1, backgroundColor: "#000" },
  media: { flex: 1 },
});
