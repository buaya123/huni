import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, REACTIONS, shadow, spacing } from "@/src/theme/tokens";
import { Avatar } from "./Avatar";
import { MoodChip } from "./MoodChip";
import { PostImages } from "./PostImages";
import type { Post } from "@/src/models/Post";


function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}



const PREVIEW_LEN = 120;



type Props = {
    post: Post;
    onChange?: (post: Post) => void;
    onReact?: (kind: string) => void;
    onBookmark?: () => void;
    onVotePulse?: (index: number) => void;
    onPress?: () => void;
    mode?: "feed" | "detail";
};

export function PostCard({
    post,
    onReact,
    onBookmark,
    onVotePulse,
    onPress,
    mode = "feed",
}: Props) {
  const router = useRouter();


const react = (kind: string) => {
    onReact?.(kind);
};

const votePulse = (idx: number) => {
    onVotePulse?.(idx);
};

const toggleBookmark = () => {
    onBookmark?.();
};

  const openProfile = () => {

    if (!post.author)
        return;

    if (!post.author.id)
        return;

    router.push(`/user/${post.author.id}`);

};

  const openPost = () => {
    if (onPress) onPress();
    else router.push(`/post/${post.id}`);
  };

  const isFeed = mode === "feed";
const content = typeof post.content === "string" ? post.content : "";

const displayContent =
    isFeed && content.length > PREVIEW_LEN
        ? `${content.slice(0, PREVIEW_LEN).trimEnd()}....`
        : content;

  // top 3 reactions
  const rEntries = Object.entries(post.reactions || {}).filter(([, v]) => v > 0);
  rEntries.sort((a, b) => b[1] - a[1]);
  const top3 = rEntries.slice(0, 3);
  const hasMore = rEntries.length > 3;

  return (
    <Pressable
    onPress={openPost}
    android_ripple={{
        color: "rgba(0,0,0,0.05)",
        borderless: false,
    }}
    style={({ pressed }) => [
        styles.card,
        pressed && {
            opacity: 0.96,
            transform: [{ scale: 0.985 }],
        },
    ]} testID={`post-card-${post.id}`}>
      <View style={styles.header}>
        <Pressable onPress={openProfile} style={styles.authorRow} hitSlop={8}>
          <Avatar
    alias={post.author?.alias ?? "Anonymous"}
    size={36}
/>
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text
    style={styles.alias}
    numberOfLines={1}
>
    {post.author?.alias ?? "Anonymous"}
</Text>
            <Text style={styles.timestamp}>{timeAgo(post.created_at)} · {post.audience}</Text>
          </View>
        </Pressable>
        <MoodChip mood={post.mood} small />
      </View>

      {!!post.title && (
        <Text style={styles.title} numberOfLines={isFeed ? 2 : undefined} testID={`post-title-${post.id}`}>
          {post.title}
        </Text>
      )}
      <Text
    style={styles.content}
    numberOfLines={isFeed ? 3 : undefined}
>
    {displayContent || ""}
</Text>

      {!!post.images?.length && <PostImages images={post.images} height={isFeed ? 240 : 320} style={borderRadius: 18}/>}

      {post.mood === "pulse" && post.pulse_options && (
        <View style={styles.pulseWrap}>
          {post.pulse_options.map((opt, idx) => {
            const votes = post.pulse_votes?.[idx] ?? 0;
            const total = (post.pulse_votes ?? []).reduce((a, b) => a + b, 0);
            const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
            const selected = post.my_pulse_vote === idx;
            const disabled = isFeed;
            return (
              <Pressable
                key={opt}
                onPress={() => !disabled && votePulse(idx)}
                style={[styles.pulseOption, disabled && { opacity: 0.9 }]}
                testID={`pulse-option-${post.id}-${idx}`}
                disabled={disabled}
              >
                <View style={[styles.pulseFill, { width: `${pct}%`, backgroundColor: selected ? colors.brandTertiary : colors.surfaceTertiary }]} />
                <View style={styles.pulseRow}>
                  <Text style={[styles.pulseLabel, selected && { color: colors.onBrandTertiary, fontWeight: "700" }]}>{opt}</Text>
                  <Text style={styles.pulsePct}>{pct}%</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {isFeed ? (
        <View style={styles.footerFeed}>
          <View style={styles.reactSummary} testID={`react-summary-${post.id}`}>
            {top3.length === 0 ? (
              <Text style={styles.emptyReact}>No reactions yet</Text>
            ) : (
              top3.map(([k, v]) => {
                const r = REACTIONS.find((x) => x.key === k);
                return (
                  <View key={k} style={styles.reactChip}>
                    <Text style={styles.reactEmoji}>{r?.label ?? "•"}</Text>
                    <Text style={styles.reactCountFeed}>{v}</Text>
                  </View>
                );
              })
            )}
            {hasMore && (
              <View style={styles.reactChip}>
                <Text style={styles.reactCountFeed}>...</Text>
              </View>
            )}
          </View>
          <View style={styles.footerRightGroup}>
            <Pressable onPress={(e) => { e.stopPropagation(); toggleBookmark(); }} style={styles.iconBtn} testID={`bookmark-btn-${post.id}`} hitSlop={6}>
              <Ionicons name={post.is_bookmarked ? "bookmark" : "bookmark-outline"} size={16} color={post.is_bookmarked ? colors.brand : colors.onSurfaceTertiary} />
            </Pressable>
            <View style={styles.commentPill}>
              <Ionicons name="chatbubble-outline" size={14} color={colors.onSurfaceTertiary} />
              <Text style={styles.commentCount}>{post.comment_count}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.footerDetail}>
          <View style={styles.reactRow}>
            {REACTIONS.map((r) => {
              const count = post.reactions?.[r.key] ?? 0;
              const active = post.my_reaction === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => react(r.key)}
                  style={[styles.reactBtn, active && styles.reactBtnActive]}
                  testID={`react-${r.key}-${post.id}`}
                  hitSlop={4}
                >
                  <Text style={styles.reactEmoji}>{r.label}</Text>
                  {count > 0 && <Text style={[styles.reactCount, active && { color: colors.onBrandTertiary }]}>{count}</Text>}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.footerRightGroup}>
            <Pressable onPress={toggleBookmark} style={[styles.iconBtn, post.is_bookmarked && styles.iconBtnActive]} testID={`bookmark-btn-${post.id}`} hitSlop={6}>
              <Ionicons name={post.is_bookmarked ? "bookmark" : "bookmark-outline"} size={18} color={post.is_bookmarked ? colors.brand : colors.onSurfaceTertiary} />
              {(post.bookmark_count ?? 0) > 0 && (
                <Text style={[styles.commentCount, post.is_bookmarked && { color: colors.brand }]}>{post.bookmark_count}</Text>
              )}
            </Pressable>
            <View style={styles.commentPill}>
              <Ionicons name="chatbubble-outline" size={14} color={colors.onSurfaceTertiary} />
              <Text style={styles.commentCount}>{post.comment_count}</Text>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
    ...shadow.card,
},
  header: {
    flexDirection: "row",
    alignItems: "center",

    marginBottom: spacing.lg,
},
  authorRow: {
    flexDirection: "row",
    alignItems: "center",

    flex: 1,

    marginRight: spacing.md,
},
  alias: {
    fontSize: font.base,

    fontWeight: "800",

    color: colors.onSurface,
},
  timestamp: {
    fontSize: font.sm,

    color: colors.muted,

    marginTop: 4,
},
  title: {
    fontSize: 21,

    fontWeight: "800",

    color: colors.onSurface,

    lineHeight: 28,

    marginBottom: 10,

    letterSpacing: -0.4,
},
  content: {
    fontSize: font.base,

    lineHeight: 24,

    color: colors.onSurfaceSecondary,

    marginBottom: spacing.lg,
},

  footerFeed: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerDetail: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },

  reactSummary: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  reactChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    gap: 3,
  },
  emptyReact: { fontSize: font.sm, color: colors.muted, fontStyle: "italic" },
  reactCountFeed: { fontSize: font.sm, color: colors.onSurfaceTertiary, fontWeight: "600" },

  reactRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", flex: 1 },
  reactBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    marginRight: 6,
  },
  reactBtnActive: { backgroundColor: colors.brandTertiary },
  reactEmoji: { fontSize: 14 },
  reactCount: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginLeft: 4, fontWeight: "600" },

  commentPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    gap: 4,
  },
  commentCount: { fontSize: font.sm, color: colors.onSurfaceTertiary, fontWeight: "600" },
  footerRightGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  iconBtnActive: { backgroundColor: colors.brandTertiary },

  pulseWrap: { marginBottom: spacing.md, gap: spacing.sm },
  pulseOption: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
    position: "relative",
    height: 46,
    justifyContent: "center",
  },
  pulseFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  pulseRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.md },
  pulseLabel: { fontSize: font.md, color: colors.onSurface },
  pulsePct: { fontSize: font.sm, color: colors.muted, fontWeight: "700" },
});
