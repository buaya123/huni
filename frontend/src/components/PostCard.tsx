import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, REACTIONS, shadow, spacing } from "@/src/theme/tokens";
import { Avatar } from "./Avatar";
import { MoodChip } from "./MoodChip";
import { api } from "@/src/api/client";

export type PostAuthor = {
  id: string;
  alias: string;
  helpful_score?: number;
};

export type Post = {
  id: string;
  author: PostAuthor;
  content: string;
  mood: string;
  audience: string;
  created_at: string;
  reactions: Record<string, number>;
  reaction_total: number;
  my_reaction: string | null;
  comment_count: number;
  pulse_options?: string[] | null;
  pulse_votes?: number[] | null;
  my_pulse_vote?: number | null;
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type Props = {
  post: Post;
  onChange?: (p: Post) => void;
  onPress?: () => void;
  compact?: boolean;
};

export function PostCard({ post, onChange, onPress, compact }: Props) {
  const router = useRouter();

  const react = async (kind: string) => {
    try {
      const updated = await api.post<Post>(`/posts/${post.id}/react`, { kind });
      onChange?.(updated);
    } catch {
      // ignore
    }
  };

  const votePulse = async (idx: number) => {
    try {
      const updated = await api.post<Post>(`/posts/${post.id}/pulse-vote`, { option_index: idx });
      onChange?.(updated);
    } catch {
      // ignore
    }
  };

  const openProfile = () => {
    if (post.author?.id) router.push(`/user/${post.author.id}`);
  };

  const openPost = () => {
    if (onPress) onPress();
    else router.push(`/post/${post.id}`);
  };

  return (
    <Pressable onPress={openPost} style={styles.card} testID={`post-card-${post.id}`}>
      <View style={styles.header}>
        <Pressable onPress={openProfile} style={styles.authorRow} hitSlop={8}>
          <Avatar alias={post.author.alias} size={36} />
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={styles.alias} numberOfLines={1}>{post.author.alias}</Text>
            <Text style={styles.timestamp}>{timeAgo(post.created_at)} · {post.audience}</Text>
          </View>
        </Pressable>
        <MoodChip mood={post.mood} small />
      </View>

      <Text style={styles.content} numberOfLines={compact ? 4 : undefined}>{post.content}</Text>

      {post.mood === "pulse" && post.pulse_options && (
        <View style={styles.pulseWrap}>
          {post.pulse_options.map((opt, idx) => {
            const votes = post.pulse_votes?.[idx] ?? 0;
            const total = (post.pulse_votes ?? []).reduce((a, b) => a + b, 0);
            const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
            const selected = post.my_pulse_vote === idx;
            return (
              <Pressable
                key={opt}
                onPress={() => votePulse(idx)}
                style={styles.pulseOption}
                testID={`pulse-option-${post.id}-${idx}`}
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

      <View style={styles.footer}>
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
        <View style={styles.commentPill}>
          <Ionicons name="chatbubble-outline" size={14} color={colors.onSurfaceTertiary} />
          <Text style={styles.commentCount}>{post.comment_count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  authorRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: spacing.sm },
  alias: { fontSize: font.base, fontWeight: "700", color: colors.onSurface },
  timestamp: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  content: { fontSize: font.lg, lineHeight: 22, color: colors.onSurface, marginBottom: spacing.md },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    gap: 4,
  },
  commentCount: { fontSize: font.sm, color: colors.onSurfaceTertiary, fontWeight: "600" },
  pulseWrap: { marginBottom: spacing.md, gap: spacing.sm },
  pulseOption: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
    position: "relative",
    height: 40,
    justifyContent: "center",
  },
  pulseFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  pulseRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.md },
  pulseLabel: { fontSize: font.base, color: colors.onSurface },
  pulsePct: { fontSize: font.sm, color: colors.muted, fontWeight: "700" },
});
