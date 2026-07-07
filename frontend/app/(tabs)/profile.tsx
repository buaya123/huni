import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/auth";
import { api } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { PostCard, type Post } from "@/src/components/PostCard";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type CommentedPost = Post & { my_comment_preview?: string; my_comment_at?: string };

export default function Profile() {
  const router = useRouter();
  const { user, refresh, regenerateAlias, updateBio } = useAuth();
  const [tab, setTab] = useState<"posts" | "comments">("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [commented, setCommented] = useState<CommentedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState("");
  const [regenNote, setRegenNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [ps, cps] = await Promise.all([
        api.get<Post[]>(`/users/${user.id}/posts`),
        api.get<CommentedPost[]>(`/users/${user.id}/commented-posts`),
      ]);
      setPosts(ps);
      setCommented(cps);
    } catch {
      setPosts([]);
      setCommented([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => { if (user) setBio(user.bio ?? ""); }, [user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    load();
  }, [refresh, load]);

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

  const joined = user.joined_at ? new Date(user.joined_at).toLocaleDateString() : "";

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.banner}>
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
          <Avatar alias={user.alias} size={72} />
          <Text style={styles.alias} testID="profile-alias">{user.alias}</Text>
          <Text style={styles.joined}>Joined {joined}</Text>

          <View style={styles.rewardsRow}>
            <Pressable style={styles.rewardsPill} onPress={() => router.push("/rewards")} testID="rewards-pill">
              <Ionicons name="sparkles" size={14} color={colors.onBrandTertiary} />
              <Text style={styles.rewardsText}>{user.points ?? 0} pts</Text>
            </Pressable>
            <Pressable style={styles.perksPill} onPress={() => router.push("/perks")} testID="perks-pill">
              <Ionicons name="pricetags-outline" size={14} color={colors.brand} />
              <Text style={styles.perksText}>Perks</Text>
            </Pressable>
          </View>

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
        </View>

        {loading ? (
          <View style={{ padding: spacing.xl, alignItems: "center" }}><ActivityIndicator color={colors.brand} /></View>
        ) : tab === "posts" ? (
          posts.length === 0 ? (
            <EmptyState title="No posts yet." subtitle="Share your first whisper from the Create tab." />
          ) : (
            <View style={{ paddingHorizontal: spacing.lg }}>
              {posts.map((p) => (
                <PostCard key={p.id} post={p} onChange={(u) => setPosts((prev) => prev.map((x) => x.id === u.id ? u : x))} />
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
  banner: { height: 100, backgroundColor: colors.brand, position: "relative" },
  qrBtn: { position: "absolute", top: 12, right: 60, padding: 8 },
  settingsBtn: { position: "absolute", top: 12, right: 16, padding: 8 },
  headerCard: {
    marginHorizontal: spacing.lg,
    marginTop: -50,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  alias: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
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
    borderRadius: radius.pill,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center" },
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
});
