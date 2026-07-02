import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { Avatar } from "@/src/components/Avatar";
import { PostCard, type Post } from "@/src/components/PostCard";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type Comment = {
  id: string;
  post_id: string;
  author: { id: string; alias: string };
  content: string;
  created_at: string;
  up: number;
  down: number;
  my_reaction: "up" | "down" | null;
};

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, cs] = await Promise.all([
        api.get<Post>(`/posts/${id}`),
        api.get<Comment[]>(`/posts/${id}/comments`),
      ]);
      setPost(p);
      setComments(cs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const c = await api.post<Comment>(`/posts/${id}/comments`, { content: text.trim() });
      setComments((prev) => [...prev, c]);
      setText("");
      if (post) setPost({ ...post, comment_count: (post.comment_count || 0) + 1 });
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const doReport = async () => {
    setShowActions(false);
    try {
      await api.post(`/report`, { target_type: "post", target_id: id, reason: "Reported from post" });
    } catch {
      // ignore
    }
  };

  const doBlock = async () => {
    setShowActions(false);
    if (!post) return;
    try {
      await api.post(`/block`, { target_user_id: post.author.id });
      router.back();
    } catch {
      // ignore
    }
  };

  const doDelete = async () => {
    setShowActions(false);
    try {
      await api.del(`/posts/${id}`);
      router.back();
    } catch {
      // ignore
    }
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

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}>
        <FlatList
          testID="comments-list"
          data={comments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
          ListHeaderComponent={
            <View>
              <PostCard post={post} onChange={setPost} onPress={() => { /* stay */ }} mode="detail" />
              <Text style={styles.commentsTitle}>Comments ({comments.length})</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyC}>Be the first to comment.</Text>}
          renderItem={({ item }) => (
            <View style={styles.commentRow} testID={`comment-${item.id}`}>
              <Avatar alias={item.author.alias} size={32} />
              <View style={{ flex: 1 }}>
                <View style={styles.commentHead}>
                  <Text style={styles.cAlias}>{item.author.alias}</Text>
                  <Text style={styles.cTime}>{timeAgo(item.created_at)}</Text>
                </View>
                <Text style={styles.cBody}>{item.content}</Text>
                <View style={styles.commentReactRow}>
                  <Pressable
                    onPress={async () => {
                      try {
                        const updated = await api.post<Comment>(`/comments/${item.id}/react`, { kind: "up" });
                        setComments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                      } catch { /* ignore */ }
                    }}
                    style={[styles.voteBtn, item.my_reaction === "up" && styles.voteBtnUp]}
                    testID={`comment-up-${item.id}`}
                    hitSlop={6}
                  >
                    <Ionicons
                      name={item.my_reaction === "up" ? "thumbs-up" : "thumbs-up-outline"}
                      size={14}
                      color={item.my_reaction === "up" ? colors.success : colors.muted}
                    />
                    <Text style={[styles.voteCount, item.my_reaction === "up" && { color: colors.success }]}>{item.up}</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      try {
                        const updated = await api.post<Comment>(`/comments/${item.id}/react`, { kind: "down" });
                        setComments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                      } catch { /* ignore */ }
                    }}
                    style={[styles.voteBtn, item.my_reaction === "down" && styles.voteBtnDown]}
                    testID={`comment-down-${item.id}`}
                    hitSlop={6}
                  >
                    <Ionicons
                      name={item.my_reaction === "down" ? "thumbs-down" : "thumbs-down-outline"}
                      size={14}
                      color={item.my_reaction === "down" ? colors.error : colors.muted}
                    />
                    <Text style={[styles.voteCount, item.my_reaction === "down" && { color: colors.error }]}>{item.down}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
        <View style={styles.inputBar}>
          <TextInput
            testID="comment-input"
            value={text}
            onChangeText={setText}
            placeholder="Add a kind comment..."
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
          />
          <Pressable onPress={submit} disabled={!text.trim() || sending} style={styles.sendBtn} testID="send-comment-btn">
            <Ionicons name="send" size={18} color={text.trim() ? "#FFF" : colors.muted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  commentsTitle: { fontSize: font.base, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.sm },
  emptyC: { color: colors.muted, textAlign: "center", padding: spacing.lg },
  commentRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm },
  commentHead: { flexDirection: "row", justifyContent: "space-between" },
  cAlias: { fontWeight: "700", color: colors.onSurface },
  cTime: { fontSize: font.sm, color: colors.muted },
  cBody: { fontSize: font.base, color: colors.onSurface, marginTop: 2, lineHeight: 20 },
  commentReactRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  voteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  voteBtnUp: { backgroundColor: "#DFF1DF" },
  voteBtnDown: { backgroundColor: "#F8D7D7" },
  voteCount: { fontSize: font.sm, color: colors.muted, fontWeight: "600" },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    maxHeight: 120, fontSize: font.base, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
});
