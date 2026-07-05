import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { PostCard, type Post } from "@/src/components/PostCard";
import { CommentsSection } from "@/src/components/CommentsSection";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [showActions, setShowActions] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.get<Post>(`/posts/${id}`);
      setPost(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const doReport = async () => {
    setShowActions(false);
    try {
      await api.post(`/report`, { target_type: "post", target_id: id, reason: "Reported from post" });
    } catch { /* ignore */ }
  };

  const doBlock = async () => {
    setShowActions(false);
    if (!post) return;
    try {
      await api.post(`/block`, { target_user_id: post.author.id });
      router.back();
    } catch { /* ignore */ }
  };

  const doDelete = async () => {
    setShowActions(false);
    try {
      await api.del(`/posts/${id}`);
      router.back();
    } catch { /* ignore */ }
  };

  if (loading || !post) {
    return (
      <SafeAreaView style={styles.wrap} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  const isMine = post.author.id === user?.id;

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.replace("/(tabs)/home")} hitSlop={12} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Post</Text>
        <Pressable onPress={() => setShowActions((s) => !s)} hitSlop={12} testID="post-actions-btn">
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {showActions && (
        <View style={styles.actionsSheet} testID="post-actions-sheet">
          {isMine ? (
            <Pressable style={styles.action} onPress={doDelete} testID="delete-post-btn">
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={[styles.actionText, { color: colors.error }]}>Delete post</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.action} onPress={doReport} testID="report-post-btn">
                <Ionicons name="flag-outline" size={18} color={colors.onSurface} />
                <Text style={styles.actionText}>Report post</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={doBlock} testID="block-user-btn">
                <Ionicons name="ban-outline" size={18} color={colors.error} />
                <Text style={[styles.actionText, { color: colors.error }]}>Block {post.author.alias}</Text>
              </Pressable>
              <Pressable
                style={styles.action}
                onPress={async () => {
                  setShowActions(false);
                  try {
                    const c = await api.post<{ id: string }>("/chat/start", { other_user_id: post.author.id });
                    router.push(`/chat/${c.id}?alias=${encodeURIComponent(post.author.alias)}&userId=${post.author.id}`);
                  } catch { /* ignore */ }
                }}
                testID="chat-user-btn"
              >
                <Ionicons name="paper-plane-outline" size={18} color={colors.brand} />
                <Text style={[styles.actionText, { color: colors.brand }]}>Message anonymously</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <View style={{ flex: 1 }}>
    <CommentsSection
        targetId={id}
        header={
            <PostCard
                post={post}
                onChange={setPost}
                onPress={() => {}}
                mode="detail"
            />
        }
        onCountChange={(delta) =>
            setPost((prev) =>
                prev
                    ? {
                          ...prev,
                          comment_count: Math.max(
                              0,
                              (prev.comment_count || 0) + delta
                          ),
                      }
                    : prev
            )
        }
    />
</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  actionsSheet: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  actionText: { fontSize: font.base, color: colors.onSurface, fontWeight: "600" },
});
