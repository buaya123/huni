import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
   Keyboard,
  KeyboardEvent,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { api, imageUrl } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { ImageViewer } from "@/src/components/PostImages";
import { pickImages, uploadImages, type PickedImage } from "@/src/utils/imagePicker";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import { useRouter } from "expo-router";



export type Comment = {
  id: string;
  post_id: string;
  author: { id: string; alias: string };
  content: string;
  created_at: string;
  up: number;
  down: number;
  my_reaction: "up" | "down" | null;
  parent_comment_id?: string | null;
  reply_to_alias?: string | null;
  images?: string[];
};

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const MAX_DEPTH = 2; // 3 visual levels: 0, 1, 2

type CNode = Comment & { children: CNode[] };

type ThreadRow = {
  comment: Comment;
  depth: number; // visual depth (clamped)
  actualDepth: number;
  ancestors: string[]; // ancestor ids, index = rail level (clamped)
  descendants: number; // total replies underneath
  collapsed: boolean;
};

function buildThreadRows(comments: Comment[], collapsed: Set<string>): ThreadRow[] {
  const map = new Map<string, CNode>();
  comments.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots: CNode[] = [];
  for (const node of map.values()) {
    if (node.parent_comment_id && map.has(node.parent_comment_id)) {
      map.get(node.parent_comment_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const score = (c: CNode) => c.up - c.down;
  const byTop = (a: CNode, b: CNode) =>
    score(b) - score(a) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  const sortDeep = (nodes: CNode[]) => {
    nodes.sort(byTop);
    nodes.forEach((n) => sortDeep(n.children));
  };
  sortDeep(roots);

  const countDesc = (n: CNode): number =>
    n.children.reduce((acc, c) => acc + 1 + countDesc(c), 0);

  const out: ThreadRow[] = [];
  const walk = (nodes: CNode[], actualDepth: number, ancestors: string[]) => {
    for (const n of nodes) {
      const depth = Math.min(actualDepth, MAX_DEPTH);
      const isCollapsed = collapsed.has(n.id);
      out.push({
        comment: n,
        depth,
        actualDepth,
        ancestors: ancestors.slice(0, depth),
        descendants: countDesc(n),
        collapsed: isCollapsed,
      });
      if (!isCollapsed) walk(n.children, actualDepth + 1, [...ancestors, n.id]);
    }
  };
  walk(roots, 0, []);
  return out;
}

type Props = {
  targetId: string; // post or ad id
  header: React.ReactElement;
  commentsEnabled?: boolean;
  canModerate?: boolean; // ad owner / admin — can delete any comment
  onCountChange?: (delta: number) => void;
};

export function CommentsSection({ targetId, header, commentsEnabled = true, canModerate = false, onCountChange }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pendingImages, setPendingImages] = useState<PickedImage[]>([]);
  const [picking, setPicking] = useState(false);
  const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);
  const inputRef = React.useRef<TextInput>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const keyboardOffset = React.useRef(new Animated.Value(0)).current;

  const router = useRouter();

  const threadRows = React.useMemo(() => buildThreadRows(comments, collapsed), [comments, collapsed]);

  const toggleCollapse = (commentId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const load = useCallback(async () => {
    try {
      const cs = await api.get<Comment[]>(`/posts/${targetId}/comments`);
      setComments(cs);
    } catch {
      // ignore
    }
  }, [targetId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if ((!text.trim() && pendingImages.length === 0) || sending) return;
    setSending(true);
    try {
      const body: Record<string, unknown> = { content: text.trim() };
      if (replyTo) body.parent_comment_id = replyTo.id;
      if (pendingImages.length > 0) body.image_ids = await uploadImages(pendingImages);
      const c = await api.post<Comment>(`/posts/${targetId}/comments`, body);
      setComments((prev) => [...prev, c]);
      setText("");
      setReplyTo(null);
      setPendingImages([]);
      onCountChange?.(1);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const addCommentImages = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const picked = await pickImages(4 - pendingImages.length);
      if (picked.length) setPendingImages((prev) => [...prev, ...picked].slice(0, 4));
    } finally {
      setPicking(false);
    }
  };

  const startReply = (c: Comment) => {
    setReplyTo(c);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const react = async (item: Comment, kind: "up" | "down") => {
    try {
      const updated = await api.post<Comment>(`/comments/${item.id}/react`, { kind });
      setComments((prev) =>
        prev.map((x) => (x.id === updated.id ? { ...x, up: updated.up, down: updated.down, my_reaction: updated.my_reaction } : x))
      );
    } catch { /* ignore */ }
  };

  const removeComment = async (item: Comment) => {
    try {
      await api.del(`/comments/${item.id}`);
      setComments((prev) => prev.filter((x) => x.id !== item.id));
      onCountChange?.(-1);
    } catch { /* ignore */ }
  };

  useEffect(() => {

    const show = Keyboard.addListener(
        Platform.OS === "ios"
            ? "keyboardWillShow"
            : "keyboardDidShow",
        (e: KeyboardEvent) => {

            Animated.spring(
                keyboardOffset,
                {
                    toValue: e.endCoordinates.height,
                    damping: 18,
                    stiffness: 200,
                    mass: 0.9,
                    useNativeDriver: false,
                }
            ).start();

        }
    );

    const hide = Keyboard.addListener(
        Platform.OS === "ios"
            ? "keyboardWillHide"
            : "keyboardDidHide",
        () => {

            Animated.timing(
                keyboardOffset,
                {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: false,
                }
            ).start();

        }
    );

    return () => {

        show.remove();
        hide.remove();

    };

}, []);

  return (
    <View style={styles.container}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        testID="comments-list"
        data={threadRows}
        keyExtractor={(r) => r.comment.id}
        contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: composerHeight + spacing.lg,
        }}
        ListHeaderComponent={
          <View>
            {header}
            <Text style={styles.commentsTitle} testID="comment-count">
              Comments ({comments.length})
            </Text>
            {!commentsEnabled && (
              <View style={styles.disabledNote} testID="comments-disabled-note">
                <Ionicons name="chatbubbles-outline" size={16} color={colors.muted} />
                <Text style={styles.disabledText}>Comments are turned off for this ad.</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          commentsEnabled ? <Text style={styles.emptyC}>Be the first to comment.</Text> : null
        }
        renderItem={({ item: row }) => {
          const item = row.comment;
          const hasReplies = row.descendants > 0;
          return (
            <View style={styles.threadRow} testID={`comment-${item.id}`}>
              {row.ancestors.map((ancestorId, i) => (
                <Pressable
                  key={`${item.id}-rail-${i}`}
                  style={styles.rail}
                  onPress={() => toggleCollapse(ancestorId)}
                  testID={`comment-rail-${item.id}-${i}`}
                >
                  <View style={styles.railLine} />
                </Pressable>
              ))}
              <View style={styles.commentBody}>
                <View
                  style={styles.commentHead}
                  testID={`comment-head-${item.id}`}
                >

                  <Pressable
                    onPress={() => router.push(`/user/${item.author.id}`)}
                    style={styles.authorPressable}
                    hitSlop={6}
                  >
                    <Avatar
                      alias={item.author.alias}
                      size={row.depth > 0 ? 22 : 26}
                    />

                    <Text style={styles.cAlias}>
                      {item.author.alias}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => hasReplies && toggleCollapse(item.id)}
                    style={styles.commentCollapseArea}
                    disabled={!hasReplies}
                  >

                    <Text style={styles.cTime}>
                      · {timeAgo(item.created_at)}
                    </Text>

                    {row.collapsed && (
                      <View
                        style={styles.collapsedPill}
                        testID={`comment-collapsed-pill-${item.id}`}
                      >
                        <Ionicons
                          name="chevron-down"
                          size={12}
                          color={colors.onBrandTertiary}
                        />

                        <Text style={styles.collapsedPillText}>
                          {row.descendants} {row.descendants === 1 ? "reply" : "replies"}
                        </Text>
                      </View>
                    )}

                  </Pressable>

                </View>
                {row.collapsed ? (
                  <Text style={styles.cBodyCollapsed} numberOfLines={1}>
                    {item.content || (item.images?.length ? "📷 Photo" : "")}
                  </Text>
                ) : (
                  <>
                    {!!item.reply_to_alias && row.actualDepth > MAX_DEPTH && (
                      <View style={styles.replyChip} testID={`comment-reply-chip-${item.id}`}>
                        <Ionicons name="return-down-forward-outline" size={12} color={colors.brand} />
                        <Text style={styles.replyChipText}>replying to {item.reply_to_alias}</Text>
                      </View>
                    )}
                    {!!item.content && <Text style={styles.cBody}>{item.content}</Text>}
                    {!!item.images?.length && (
                      <View style={styles.cImageRow} testID={`comment-images-${item.id}`}>
                        {item.images.map((imgId, i) => (
                          <Pressable
                            key={imgId}
                            onPress={() => setViewer({ images: item.images!, index: i })}
                            testID={`comment-image-${item.id}-${i}`}
                          >
                            <Image source={{ uri: imageUrl(imgId) }} style={styles.cImage} contentFit="cover" transition={100} />
                          </Pressable>
                        ))}
                      </View>
                    )}
                    <View style={styles.commentReactRow}>
                      <Pressable
                        onPress={() => react(item, "up")}
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
                        onPress={() => react(item, "down")}
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
                      {commentsEnabled && (
                        <Pressable
                          onPress={() => startReply(item)}
                          style={styles.replyBtn}
                          testID={`comment-reply-${item.id}`}
                          hitSlop={6}
                        >
                          <Ionicons name="chatbubble-outline" size={13} color={colors.brand} />
                          <Text style={styles.replyBtnText}>Reply</Text>
                        </Pressable>
                      )}
                      {canModerate && (
                        <Pressable
                          onPress={() => removeComment(item)}
                          style={styles.replyBtn}
                          testID={`comment-delete-${item.id}`}
                          hitSlop={6}
                        >
                          <Ionicons name="trash-outline" size={13} color={colors.error} />
                          <Text style={[styles.replyBtnText, { color: colors.error }]}>Delete</Text>
                        </Pressable>
                      )}
                    </View>
                  </>
                )}
              </View>
            </View>
          );
        }}
      /><View style={styles.container}>
      {commentsEnabled && (
        <Animated.View
            style={[
                styles.inputBar,
                {
                    transform: [
                        {
                            translateY: Animated.multiply(
                                keyboardOffset,
                                -1
                            ),
                        },
                    ],
                },
            ]}
        >
          {replyTo && (
            <View style={styles.replyBanner} testID="reply-banner">
              <Text style={styles.replyBannerText} numberOfLines={1}>
                Replying to <Text style={{ fontWeight: "700" }}>{replyTo.author.alias}</Text>
              </Text>
              <Pressable onPress={() => setReplyTo(null)} testID="cancel-reply-btn" hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.onSurface} />
              </Pressable>
            </View>
          )}
          {pendingImages.length > 0 && (
            <View style={styles.pendingRow} testID="pending-images">
              {pendingImages.map((img, idx) => (
                <View key={`${img.uri}-${idx}`} style={styles.pendingThumbWrap}>
                  <Image source={{ uri: img.uri }} style={styles.pendingThumb} contentFit="cover" />
                  <Pressable
                    style={styles.pendingRemove}
                    onPress={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                    hitSlop={8}
                    testID={`remove-pending-image-${idx}`}
                  >
                    <Ionicons name="close" size={12} color="#FFF" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <View style={styles.inputRow}>
            <Pressable
              onPress={addCommentImages}
              disabled={picking || pendingImages.length >= 4}
              style={styles.imageBtn}
              testID="comment-image-btn"
              hitSlop={6}
            >
              {picking ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Ionicons name="image-outline" size={22} color={pendingImages.length >= 4 ? colors.muted : colors.brand} />
              )}
            </Pressable>
            <TextInput
              testID="comment-input"
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={replyTo ? `Reply to ${replyTo.author.alias}...` : "Add a comment..."}
              placeholderTextColor={colors.muted}
              style={styles.input}
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
              
            />
            <Pressable
              onPress={submit}
              disabled={(!text.trim() && pendingImages.length === 0) || sending}
              style={styles.sendBtn}
              testID="send-comment-btn"
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="send" size={18} color={text.trim() || pendingImages.length > 0 ? "#FFF" : colors.muted} />
              )}
            </Pressable>
          </View>
        </Animated.View>
      )}
      </View>
      {viewer && (
        <ImageViewer visible images={viewer.images} initialIndex={viewer.index} onClose={() => setViewer(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
},
  commentsTitle: { fontSize: font.base, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.sm },
  emptyC: { color: colors.muted, textAlign: "center", padding: spacing.lg },
  disabledNote: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
  },
  authorPressable: {
    flexDirection: "row",
    alignItems: "center",
  },

  commentCollapseArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  disabledText: { color: colors.muted, fontSize: font.sm },
  threadRow: { flexDirection: "row", marginBottom: 2 },
  rail: { width: 18, alignItems: "center", alignSelf: "stretch" },
  railLine: { flex: 1, width: 2, borderRadius: 1, backgroundColor: colors.borderStrong },
  commentBody: { flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 },
  cAlias: { fontWeight: "700", color: colors.onSurface, fontSize: font.sm + 1 },
  cTime: { fontSize: font.sm, color: colors.muted },
  cBody: { fontSize: font.base, color: colors.onSurface, marginTop: 2, lineHeight: 20 },
  cBodyCollapsed: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  cImageRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  cImage: { width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  collapsedPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill,
  },
  collapsedPillText: { fontSize: 11, color: colors.onBrandTertiary, fontWeight: "700" },
  commentReactRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  voteBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary,
  },
  voteBtnUp: { backgroundColor: "#DFF1DF" },
  voteBtnDown: { backgroundColor: "#F8D7D7" },
  voteCount: { fontSize: font.sm, color: colors.muted, fontWeight: "600" },
  replyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  replyBtnText: { fontSize: font.sm, color: colors.brand, fontWeight: "700" },
  replyChip: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm,
    marginTop: 2, marginBottom: 4,
  },
  replyChipText: { fontSize: 11, color: colors.onBrandTertiary, fontWeight: "600" },
  replyBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.brandTertiary,
    borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md,
  },
  replyBannerText: { color: colors.onBrandTertiary, fontSize: font.sm, flex: 1 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  inputBar: {
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  input: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    maxHeight: 120, fontSize: font.base, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  imageBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  pendingRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pendingThumbWrap: { position: "relative" },
  pendingThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  pendingRemove: {
    position: "absolute", top: -5, right: -5,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center", justifyContent: "center",
  },
});
