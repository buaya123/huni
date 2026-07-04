import React, { useEffect, useRef } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { PostImages } from "@/src/components/PostImages";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

export type Ad = {
  type: "ad";
  id: string;
  advertiser_id: string;
  business_name: string;
  title: string;
  content: string;
  link_url?: string | null;
  images: string[];
  comments_enabled: boolean;
  comment_count: number;
  created_at: string;
};

type Props = {
  ad: Ad;
  mode?: "feed" | "detail";
  trackImpression?: boolean;
};

export function AdCard({ ad, mode = "feed", trackImpression = true }: Props) {
  const router = useRouter();
  const isFeed = mode === "feed";
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!trackImpression || trackedRef.current) return;
    trackedRef.current = true;
    api.post(`/ads/${ad.id}/impression`).catch(() => {});
  }, [ad.id, trackImpression]);

  const onLearnMore = async () => {
    try {
      const res = await api.post<{ link_url?: string | null }>(`/ads/${ad.id}/click`);
      if (res.link_url) Linking.openURL(res.link_url);
    } catch { /* ignore */ }
  };

  const openDetail = () => {
    if (isFeed) router.push(`/ad/${ad.id}`);
  };

  return (
    <Pressable style={styles.card} onPress={openDetail} disabled={!isFeed} testID={`ad-card-${ad.id}`}>
      <View style={styles.head}>
        <View style={styles.bizAvatar}>
          <Ionicons name="storefront" size={16} color={colors.brand} />
        </View>
        <Text style={styles.bizName} numberOfLines={1}>{ad.business_name}</Text>
        <View style={styles.sponsoredPill} testID={`ad-sponsored-${ad.id}`}>
          <Text style={styles.sponsoredText}>Sponsored</Text>
        </View>
      </View>

      <Text style={styles.title}>{ad.title}</Text>
      <Text style={styles.content} numberOfLines={isFeed ? 3 : undefined}>{ad.content}</Text>

      {!!ad.images?.length && <PostImages images={ad.images} height={isFeed ? 220 : 300} />}

      <View style={styles.footer}>
        {!!ad.link_url && (
          <Pressable style={styles.ctaBtn} onPress={onLearnMore} testID={`ad-learn-more-${ad.id}`}>
            <Text style={styles.ctaText}>Learn more</Text>
            <Ionicons name="open-outline" size={14} color="#FFF" />
          </Pressable>
        )}
        {ad.comments_enabled && (
          <Pressable style={styles.commentPill} onPress={openDetail} disabled={!isFeed} testID={`ad-comments-${ad.id}`}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.muted} />
            <Text style={styles.commentText}>{ad.comment_count}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  bizAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  bizName: { flex: 1, fontWeight: "800", color: colors.onSurface, fontSize: font.base },
  sponsoredPill: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
  },
  sponsoredText: { fontSize: 10, fontWeight: "800", color: colors.muted, letterSpacing: 0.5, textTransform: "uppercase" },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, marginBottom: 4 },
  content: { fontSize: font.base, color: colors.onSurfaceTertiary, lineHeight: 20, marginBottom: spacing.md },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderRadius: radius.pill,
  },
  ctaText: { color: "#FFF", fontWeight: "700", fontSize: font.sm },
  commentPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary,
  },
  commentText: { color: colors.muted, fontWeight: "700", fontSize: font.sm },
});
