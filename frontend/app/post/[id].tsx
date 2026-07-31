import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import type { Post } from "@/src/models/Post";
import { PostCard } from "@/src/components/PostCard";
import { CommentsSection } from "@/src/components/CommentsSection";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import { ReportRepository } from "@/src/repositories/ReportRepository";
import { UserRepository } from "@/src/repositories/UserRepository";
import { PostRepository } from "@/src/repositories/PostRepository";
import { useFeedStore } from "@/src/stores/feed/useFeedStore"

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const react = useFeedStore((s) => s.react);
  const toggleBookmark = useFeedStore((s) => s.toggleBookmark);
  const votePulse = useFeedStore((s) => s.votePulse);
  const loadPost = useFeedStore((s) => s.loadPost);
  const storePost = useFeedStore((s) => s.getPost(id));
  
  const router = useRouter();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);


const [loadError, setLoadError] =
    useState<"not_found" | "error" | null>(null);
  const [loading, setLoading] = useState(true);
  const [showActions, setShowActions] = useState(false);



const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
        const p = await loadPost(id);
        setPost(p);
    } catch (e: any) {
        if (e.status === 404) {
            setLoadError("not_found");
        } else {
            console.error(e);
            setLoadError("error");
        }
    } finally {
        setLoading(false);
    }
}, [id, loadPost]);

  useEffect(() => { load(); }, [load]);

  const doReport = async () => {
    setShowActions(false);
    try {
      await ReportRepository.report(
    "post",
    id,
    "Reported from post",
);
    } catch { /* ignore */ }
  };

  const doBlock = async () => {
    setShowActions(false);
    if (!displayPost) return;
    try {
      await UserRepository.block(
    displayPost.author.id,
);
      router.back();
    } catch { /* ignore */ }
  };

  const doDelete = async () => {
    setShowActions(false);
    try {
      await PostRepository.delete(id);
      router.back();
    } catch { /* ignore */ }
  };

  if (loading || !post) {
    if (loadError === "not_found") {
    return (
        <SafeAreaView style={styles.wrap}>
            <View style={styles.center}>

                <Ionicons
                    name="document-outline"
                    size={64}
                    color={colors.muted}
                />

                <Text
                    style={{
                        fontSize: font.lg,
                        fontWeight: "700",
                        color: colors.onSurface,
                        marginTop: spacing.lg,
                    }}
                >
                    This post is no longer available
                </Text>

                <Text
                    style={{
                        color: colors.muted,
                        textAlign: "center",
                        marginTop: spacing.sm,
                        paddingHorizontal: spacing.xl,
                    }}
                >
                    It may have been deleted by its author or removed by moderators.
                </Text>

                <Pressable
                    onPress={() => router.back()}
                    style={{
                        marginTop: spacing.xl,
                    }}
                >
                    <Text
                        style={{
                            color: colors.brand,
                            fontWeight: "700",
                        }}
                    >
                        Go Back
                    </Text>
                </Pressable>

            </View>
        </SafeAreaView>
    );
}
    
    return (
      <SafeAreaView style={styles.wrap} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }
  const displayPost = storePost ?? post;
  const isMine = displayPost.author.id === user?.id;
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
                <Text style={[styles.actionText, { color: colors.error }]}>Block {displayPost.author.alias}</Text>
              </Pressable>
              <Pressable
                style={styles.action}
                onPress={async () => {
                  setShowActions(false);
                  try {
                    const c = await api.post<{ id: string }>("/chat/start", { other_user_id: displayPost.author.id });
                    router.push(`/chat/${c.id}?alias=${encodeURIComponent(displayPost.author.alias)}&userId=${displayPost.author.id}`);
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


    <CommentsSection
        targetId={id}
        header={
            <PostCard
                post={displayPost}

                onReact={(kind: string) => react(displayPost.id, kind)}

                onBookmark={() => toggleBookmark(displayPost.id)}

                onVotePulse={(index: number) => votePulse(displayPost.id, index)}

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
