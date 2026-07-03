import React, { useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { imageUrl } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme/tokens";

type ViewerProps = {
  visible: boolean;
  images: string[]; // image ids
  initialIndex?: number;
  onClose: () => void;
};

export function ImageViewer({ visible, images, initialIndex = 0, onClose }: ViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const winW = Dimensions.get("window").width;
  const winH = Dimensions.get("window").height;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerWrap}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * winW, y: 0 }}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / winW))}
        >
          {images.map((id) => (
            <View key={id} style={{ width: winW, height: winH, justifyContent: "center" }}>
              <Image
                source={{ uri: imageUrl(id) }}
                style={{ width: winW, height: winH * 0.8 }}
                contentFit="contain"
                transition={150}
              />
            </View>
          ))}
        </ScrollView>
        <Pressable style={styles.viewerClose} onPress={onClose} hitSlop={12} testID="image-viewer-close">
          <Ionicons name="close" size={26} color="#FFF" />
        </Pressable>
        {images.length > 1 && (
          <View style={styles.viewerCounter}>
            <Text style={styles.counterText}>{index + 1}/{images.length}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

type Props = {
  images: string[]; // image ids
  height?: number;
};

/** Reddit-style full-width image carousel with paging + counter badge. */
export function PostImages({ images, height = 280 }: Props) {
  const [index, setIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [width, setWidth] = useState(0);

  if (!images || images.length === 0) return null;

  return (
    <View
      style={[styles.carouselWrap, { height }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      testID="post-images"
    >
      {width > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {images.map((id, i) => (
            <Pressable key={id} onPress={() => setViewerOpen(true)} testID={`post-image-${i}`}>
              <Image
                source={{ uri: imageUrl(id) }}
                style={{ width, height }}
                contentFit="cover"
                transition={150}
              />
            </Pressable>
          ))}
        </ScrollView>
      )}
      {images.length > 1 && (
        <View style={styles.counterBadge} testID="post-images-counter">
          <Text style={styles.counterText}>{index + 1}/{images.length}</Text>
        </View>
      )}
      {images.length > 1 && (
        <View style={styles.dots}>
          {images.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
      <ImageViewer
        visible={viewerOpen}
        images={images}
        initialIndex={index}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  carouselWrap: {
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceTertiary,
  },
  counterBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  counterText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  dots: {
    position: "absolute",
    bottom: spacing.sm,
    alignSelf: "center",
    flexDirection: "row",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  dotActive: { backgroundColor: "#FFF" },
  viewerWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)" },
  viewerClose: {
    position: "absolute",
    top: 50,
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerCounter: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
});
