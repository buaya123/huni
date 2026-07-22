import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, imageUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { Avatar } from "@/src/components/Avatar";
import { PostCard, type Post } from "@/src/components/PostCard";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type Profile = {
  id: string;
  alias: string;
  helpful_score: number;
  post_count: number;
  comment_count: number;
  bio: string;
  joined_at: string;
  exp?: number;
  points?: number;
  tokens?: number;
  rank_level?: number;
  rank_title?: string;
};

type EquippedStyles = Record<string, { item_id: string; image_id: string | null; hex_color: string | null; name: string } | null>;

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [equipped, setEquipped] = useState<EquippedStyles>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [u, ps, equ] = await Promise.all([
        api.get<Profile>(`/users/${id}`),
        api.get<Post[]>(`/users/${id}/posts`),
        api.get<EquippedStyles>(`/users/${id}/equipped_styles`).catch(() => ({} as EquippedStyles)),
      ]);
      setProfile(u);
      setPosts(ps);
      setEquipped(equ);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const startChat = async () => {
    if (!profile) return;
    try {
      const c = await api.post<{ id: string }>("/chat/start", { other_user_id: profile.id });
      router.push(`/chat/${c.id}?alias=${encodeURIComponent(profile.alias)}&userId=${profile.id}`);
    } catch {
      // ignore
    }
  };

  const doBlock = async () => {
    if (!profile) return;
    try {
      await api.post("/block", { target_user_id: profile.id });
      router.back();
    } catch { /* ignore */ }
  };

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.wrap} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  const isMe = profile.id === user?.id;
  const joined = profile.joined_at ? new Date(profile.joined_at).toLocaleDateString() : "";
  const bgColor = equipped?.bg_color?.hex_color;
  const bgPatternId = equipped?.bg_pattern?.image_id;
  const borderId = equipped?.border?.image_id;
  const avatarId = equipped?.avatar?.image_id;

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.replace("/(tabs)/home")} hitSlop={12} testID="back-btn">
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Profile</Text>
          <View style={{ width: 26 }} />
        </View>

        {(bgColor || bgPatternId) && (
          <View style={[styles.banner, { backgroundColor: bgColor || colors.brand }]}>
            {bgPatternId && (
              <Image source={{ uri: imageUrl(bgPatternId) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            )}
          </View>
        )}

        <View style={[styles.card, (bgColor || bgPatternId) && { marginTop: -50 }]}>
          <Avatar alias={profile.alias} size={72} avatarImageId={avatarId} borderImageId={borderId} />
          <Text style={styles.alias}>{profile.alias}</Text>
          <Text style={styles.joined}>Joined {joined}</Text>
          <View style={styles.rankRow}>
            <View style={styles.levelPill}>
              <Ionicons name="trophy" size={12} color="#FFFFFF" />
              <Text style={styles.levelText}>Lv. {profile.rank_level ?? 1}</Text>
            </View>
            <Text style={styles.titleText}>{profile.rank_title || "New Neighbor"}</Text>
          </View>
          <Text style={styles.expLine}>{(profile.exp ?? profile.points ?? 0).toLocaleString()} EXP</Text>
          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statValue}>{profile.helpful_score}</Text><Text style={styles.statLabel}>Helpful</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{profile.post_count}</Text><Text style={styles.statLabel}>Posts</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{profile.comment_count}</Text><Text style={styles.statLabel}>Comments</Text></View>
          </View>
          {!isMe && (
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable style={styles.primaryBtn} onPress={startChat} testID="chat-from-profile-btn">
                <Ionicons name="paper-plane-outline" size={16} color="#FFF" />
                <Text style={styles.primaryBtnText}>Message</Text>
              </Pressable>
              <Pressable style={styles.ghostBtn} onPress={doBlock} testID="block-from-profile-btn">
                <Text style={styles.ghostBtnText}>Block</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Posts</Text>
        <View style={{ paddingHorizontal: spacing.lg }}>
          {posts.length === 0 ? (
            <Text style={{ color: colors.muted, textAlign: "center", padding: spacing.lg }}>No posts yet.</Text>
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} onChange={(u) => setPosts((prev) => prev.map((x) => x.id === u.id ? u : x))} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  banner: { height: 100, backgroundColor: colors.brand, position: "relative", overflow: "hidden" },
  card: { marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, alignItems: "center", gap: spacing.sm },
  alias: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  joined: { fontSize: font.sm, color: colors.muted },
  rankRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 },
  levelPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  levelText: { color: "#FFFFFF", fontWeight: "900", fontSize: font.sm },
  titleText: { color: colors.brand, fontWeight: "800", fontSize: font.sm },
  expLine: { color: colors.muted, fontSize: font.sm, fontWeight: "700", marginTop: 2 },
  bio: { fontSize: font.base, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: spacing.sm },
  stats: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.md },
  stat: { alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  statLabel: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill },
  primaryBtnText: { color: "#FFF", fontWeight: "700" },
  ghostBtn: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill },
  ghostBtnText: { color: colors.onSurface, fontWeight: "700" },
  sectionTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
});
