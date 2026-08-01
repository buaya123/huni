import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/auth";
import { imageUrl } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import type { Post } from "@/src/models/Post";
import { PostCard } from "@/src/components/PostCard";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import { ProfileRepository } from "@/src/repositories/ProfileRepository"
import { useProfileStore } from "@/src/stores/profile/useProfileStore";

type CommentedPost = Post & { my_comment_preview?: string; my_comment_at?: string };
type EquippedStyles = Record<string, { item_id: string; image_id: string | null; hex_color: string | null; name: string } | null>;

export default function Profile() {
  const router = useRouter();
  const { user, refresh, regenerateAlias, updateBio } = useAuth();
  const [tab, setTab] = useState<"posts" | "comments" | "listen">("posts");
  const PAGE_SIZE = 30;

  const [postsOffset, setPostsOffset] = useState(30);
  const [commentsOffset, setCommentsOffset] = useState(30);
  const [listenedOffset, setListenedOffset] = useState(30);

  const [postsHasMore, setPostsHasMore] = useState(true);
  const [commentsHasMore, setCommentsHasMore] = useState(true);
  const [listenedHasMore, setListenedHasMore] = useState(true);

  const [loadingMore, setLoadingMore] = useState(false);
  const posts = useProfileStore((s) => s.posts);
  const commented = useProfileStore((s) => s.commented);
  const listened = useProfileStore((s) => s.listened);
  const equipped = useProfileStore((s) => s.equipped);
  const scannerPartners = useProfileStore((s) => s.scannerPartners);

  const loading = useProfileStore((s) => s.loading);
  const load = useProfileStore((s) => s.load);
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState("");
  const [regenNote, setRegenNote] = useState<string | null>(null);
  const refreshing = useProfileStore((s) => s.refreshing);
  const setPosts = useProfileStore((s) => s.setPosts);
  const setListened = useProfileStore((s) => s.setListened);
  const refreshProfile = useProfileStore((s) => s.refresh);

  const setCommented = useProfileStore((s) => s.setCommented);

useEffect(() => {
    if (user) {
        load(user.id);
    }
}, [user, load]);

useEffect(() => {
    setPostsOffset(posts.length);
    setCommentsOffset(commented.length);
    setListenedOffset(listened.length);

    setPostsHasMore(posts.length === PAGE_SIZE);
    setCommentsHasMore(commented.length === PAGE_SIZE);
    setListenedHasMore(listened.length === PAGE_SIZE);
}, [posts, commented, listened]);

  // Re-fetch when the tab regains focus so newly-listened posts show up.
  useFocusEffect(
    useCallback(() => {
        if (user) {
            load(user.id);
        }
    }, [user, load])
);

  useEffect(() => { if (user) setBio(user.bio ?? ""); }, [user]);

const onRefresh = useCallback(async () => {
    await refresh();

    if (user) {
        await refreshProfile(user.id);
        setPostsOffset(posts.length);
        setCommentsOffset(commented.length);
        setListenedOffset(listened.length);

        setPostsHasMore(posts.length === PAGE_SIZE);
        setCommentsHasMore(commented.length === PAGE_SIZE);
        setListenedHasMore(listened.length === PAGE_SIZE);
    }
}, [refresh, refreshProfile, user]);

  if (!user) return null;

  const doRegen = async () => {
    setRegenNote(null);
    try {
      await regenerateAlias();
      setRegenNote("New alias assigned!");
    } catch (e: unknown) {
      setRegenNote(e instanceof Error ? e.message : "Could not regenerate");
    }
  };

  const saveBio = async () => {
    try {
      await updateBio(bio);
      setEditingBio(false);
    } catch { /* ignore */ }
  };

  const loadMorePosts = async () => {
    if (!user || loadingMore || !postsHasMore) return;

    setLoadingMore(true);

    try {
        const rows = await ProfileRepository.loadPosts(
            user.id,
            postsOffset,
            PAGE_SIZE
        );

        setPosts([
            ...posts,
            ...rows.filter(r => !posts.some(p => p.id === r.id)),
        ]);

        setPostsOffset(postsOffset + rows.length);

        if (rows.length < PAGE_SIZE) {
            setPostsHasMore(false);
        }
    } finally {
        setLoadingMore(false);
    }
};

const loadMoreComments = async () => {
    if (!user || loadingMore || !commentsHasMore) return;

    setLoadingMore(true);

    try {
        const rows = await ProfileRepository.loadComments(
            user.id,
            commentsOffset,
            PAGE_SIZE
        );

        setCommented([
            ...commented,
            ...rows.filter(r => !commented.some(c => c.id === r.id)),
        ]);

        setCommentsOffset(prev => prev + rows.length);

        if (rows.length < PAGE_SIZE) {
            setCommentsHasMore(false);
        }
    } finally {
        setLoadingMore(false);
    }
};

const loadMoreListened = async () => {
    if (loadingMore || !listenedHasMore) return;

    setLoadingMore(true);

    try {
        const rows = await ProfileRepository.loadListened(
            listenedOffset,
            PAGE_SIZE
        );

        setListened([
            ...listened,
            ...rows.filter(r => !listened.some(p => p.id === r.id)),
        ]);

        setListenedOffset(prev => prev + rows.length);

        if (rows.length < PAGE_SIZE) {
            setListenedHasMore(false);
        }
    } finally {
        setLoadingMore(false);
    }
};

  const joined = user.joined_at ? new Date(user.joined_at).toLocaleDateString() : "";
  const bgColor = equipped?.bg_color?.hex_color || colors.brand;
  const bgPatternId = equipped?.bg_pattern?.image_id;
  const borderId = equipped?.border?.image_id;
  const avatarId = equipped?.avatar?.image_id;

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={[styles.banner, { backgroundColor: bgColor }]}>
          {bgPatternId && (
            <Image
              source={{ uri: imageUrl(bgPatternId) }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          )}
          <Pressable
            style={styles.qrBtn}
            onPress={() => router.push("/qr")}
            testID="qr-btn"
            hitSlop={8}
          >
            <Ionicons name="qr-code-outline" size={22} color="#FFF" />
          </Pressable>
          <Pressable
            style={styles.settingsBtn}
            onPress={() => router.push("/settings")}
            testID="settings-btn"
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={22} color="#FFF" />
          </Pressable>
        </View>
        <View style={styles.headerCard}>
          <Avatar alias={user.alias} size={84} avatarImageId={avatarId} borderImageId={borderId} />
          <Text style={styles.alias} testID="profile-alias">{user.alias}</Text>
          <Text style={styles.joined}>Joined {joined}</Text>

          <View style={styles.rewardsRow}>
            <Pressable style={styles.rewardsPill} onPress={() => router.push("/rewards")} testID="rewards-pill">
              <Ionicons name="trophy" size={14} color={colors.onBrandTertiary} />
              <Text style={styles.rewardsText}>Lv. {user.rank_level ?? 1} · {(user.exp ?? user.points ?? 0).toLocaleString()} EXP</Text>
            </Pressable>
            <Pressable style={styles.perksPill} onPress={() => router.push("/store")} testID="tokens-pill">
              <Ionicons name="cash-outline" size={14} color={colors.brand} />
              <Text style={styles.perksText}>{(user.tokens ?? 0).toLocaleString()} tokens</Text>
            </Pressable>
            {
            scannerPartners.length > 0 && (

           <Pressable
              style={styles.perksPill}
              onPress={() => {
                  if (scannerPartners.length === 1) {
                      router.push({
                          pathname: "/partner/scan",
                          params: {
                              partner_id: scannerPartners[0].id,
                          },
                      });
                  } else {
                      router.push("/partner/select");
                  }
              }}
          >
              <Ionicons
                  name="qr-code-outline"
                  size={14}
                  color={colors.brand}
              />
              <Text style={styles.perksText}>
                  Scanner
              </Text>
          </Pressable>
            )
            }
          </View>
          {!!user.rank_title && (
            <Text style={styles.rankTitleLabel}>{user.rank_title}</Text>
          )}

          {editingBio ? (
            <View style={{ width: "100%", gap: spacing.sm }}>
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="Add a short bio (optional)"
                placeholderTextColor={colors.muted}
                multiline
                maxLength={200}
                style={styles.bioInput}
                testID="bio-input"
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Pressable style={styles.smallBtn} onPress={saveBio} testID="save-bio-btn">
                  <Text style={styles.smallBtnText}>Save</Text>
                </Pressable>
                <Pressable style={[styles.smallBtn, styles.smallBtnGhost]} onPress={() => { setEditingBio(false); setBio(user.bio ?? ""); }}>
                  <Text style={[styles.smallBtnText, { color: colors.onSurface }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setEditingBio(true)} testID="edit-bio-btn">
              <Text style={styles.bio}>{user.bio || "Tap to add a short bio (optional)"}</Text>
            </Pressable>
          )}

          <View style={styles.stats}>
            <Stat label="Helpful" value={user.helpful_score} />
            <Stat label="Posts" value={user.post_count} />
            <Stat label="Comments" value={user.comment_count} />
          </View>

          <Pressable style={styles.regen} onPress={doRegen} testID="regen-alias-btn">
            <Ionicons name="refresh-outline" size={16} color={colors.brand} />
            <Text style={styles.regenText}>Regenerate alias (once per 7 days)</Text>
          </Pressable>
          {regenNote && <Text style={styles.regenNote}>{regenNote}</Text>}
        </View>

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setTab("posts")}
            style={[styles.tab, tab === "posts" && styles.tabActive]}
            testID="profile-tab-posts"
          >
            <Text style={[styles.tabText, tab === "posts" && styles.tabTextActive]}>Posts ({posts.length})</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("comments")}
            style={[styles.tab, tab === "comments" && styles.tabActive]}
            testID="profile-tab-comments"
          >
            <Text style={[styles.tabText, tab === "comments" && styles.tabTextActive]}>Comments ({commented.length})</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("listen")}
            style={[styles.tab, tab === "listen" && styles.tabActive]}
            testID="profile-tab-listen"
          >
            <Text style={[styles.tabText, tab === "listen" && styles.tabTextActive]}>Listen ({listened.length})</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={{ padding: spacing.xl, alignItems: "center" }}><ActivityIndicator color={colors.brand} /></View>
        ) : tab === "posts" ? (
          posts.length === 0 ? (
            <EmptyState title="No posts yet." subtitle="Share your first whisper from the Create tab." />
          ) : (
            <View style={{ paddingHorizontal: spacing.lg }}>
              {posts.map((p) => (
                <PostCard
                    key={p.id}
                    post={p}
                    onChange={(u) =>
                        setPosts(
                            posts.map(x => x.id === u.id ? u : x)
                        )
                    }
                />
              ))             
              }
              {postsHasMore && (
                  <Pressable
                      style={styles.loadMore}
                      onPress={loadMorePosts}
                      disabled={loadingMore}
                  >
                      {loadingMore ? (
                          <ActivityIndicator color={colors.brand} />
                      ) : (
                          <Text style={styles.loadMoreText}>Load More</Text>
                      )}
                  </Pressable>
              )}
            </View>
          )
        ) : tab === "listen" ? (
          listened.length === 0 ? (
            <EmptyState
              title="Nothing on Listen yet"
              subtitle="Tap the bookmark icon on any post to add it to Listen. You'll be notified when there's a new comment."
            />
          ) : (
            <View style={{ paddingHorizontal: spacing.lg }}>
              {listened.map((p) => (
                <PostCard
                    key={p.id}
                    post={p}
                    onChange={(u)=>{
                      setListened(
                          listened.filter(x => x.id !== u.id)
                      )
                    }}
                />
              ))}
            </View>
          )
        ) : commented.length === 0 ? (
          <EmptyState title="No commented posts yet." subtitle="When you comment on a post, it lands here so you can return anytime." />
        ) : (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {commented.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/post/${p.id}`)}
                style={styles.threadCard}
                testID={`commented-thread-${p.id}`}
              >
                <View style={styles.threadHead}>
                  <Avatar alias={p.author.alias} size={28} />
                  <Text style={styles.threadAlias} numberOfLines={1}>{p.author.alias}</Text>
                  <Text style={styles.threadMood}>{p.mood.replace("_", " ")}</Text>
                </View>
                <Text style={styles.threadContent} numberOfLines={2}>{p.content}</Text>
                {p.my_comment_preview && (
                  <View style={styles.myCommentRow}>
                    <Ionicons name="return-down-forward-outline" size={14} color={colors.brand} />
                    <Text style={styles.myCommentText} numberOfLines={1}>you: {p.my_comment_preview}</Text>
                  </View>
                )}
                <View style={styles.threadFooter}>
                  <Text style={styles.threadStat}>{p.comment_count} comments</Text>
                  <Text style={styles.threadStat}>·</Text>
                  <Text style={styles.threadStat}>{p.reaction_total} reactions</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  banner: { height: 140, backgroundColor: colors.brand, position: "relative" },
  qrBtn: { position: "absolute", top: 12, right: 60, padding: 8 },
  settingsBtn: { position: "absolute", top: 12, right: 16, padding: 8 },
  headerCard: {
    marginHorizontal: spacing.lg,
    marginTop: -50,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    ...shadow.card,
    alignItems: "center",
    gap: spacing.sm,
  },
  alias: { fontSize: 24, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm,letterSpacing:-0.4},
  joined: { fontSize: font.sm, color: colors.muted },
  bio: { fontSize: font.base, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: spacing.sm },
  bioInput: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    minHeight: 60, fontSize: font.base, color: colors.onSurface, borderWidth: 1, borderColor: colors.border,
  },
  stats: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.md },
  stat: { alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  statLabel: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  regen: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.brandTertiary, borderRadius: radius.pill,
  },
  regenText: { color: colors.onBrandTertiary, fontSize: font.sm, fontWeight: "600" },
  regenNote: { fontSize: font.sm, color: colors.muted, marginTop: 4 },
  rewardsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  rewardsPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  rewardsText: { color: colors.onBrandTertiary, fontWeight: "800", fontSize: font.sm },
  perksPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  perksText: { color: colors.brand, fontWeight: "800", fontSize: font.sm },
  rankTitleLabel: { marginTop: 4, color: colors.brand, fontWeight: "800", fontSize: font.sm, textAlign: "center" },
  smallBtn: {
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 8,
  },
  smallBtnGhost: { backgroundColor: colors.surfaceTertiary },
  smallBtnText: { color: "#FFF", fontWeight: "700" },

  tabs: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceTertiary,
    padding: 5,
    borderRadius: radius.xl,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center",...shadow.card },
  tabActive: { backgroundColor: colors.surfaceSecondary },
  tabText: { color: colors.onSurfaceTertiary, fontWeight: "600", fontSize: font.sm },
  tabTextActive: { color: colors.onSurface, fontWeight: "700" },

  threadCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  threadHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  threadAlias: { fontWeight: "700", color: colors.onSurface, flex: 1 },
  threadMood: { fontSize: font.sm, color: colors.brand, fontWeight: "700", textTransform: "capitalize" },
  threadContent: { fontSize: font.base, color: colors.onSurface, lineHeight: 20 },
  myCommentRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm },
  myCommentText: { flex: 1, color: colors.onBrandTertiary, fontSize: font.sm, fontStyle: "italic" },
  threadFooter: { flexDirection: "row", gap: spacing.sm, marginTop: 2 },
  threadStat: { fontSize: font.sm, color: colors.muted },
  loadMore: {
    marginVertical: spacing.lg,
    alignItems: "center",
    padding: spacing.md,
},

loadMoreText: {
    color: colors.brand,
    fontWeight: "700",
},
});
