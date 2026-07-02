import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/auth";
import { api } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { PostCard, type Post } from "@/src/components/PostCard";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

export default function Profile() {
  const router = useRouter();
  const { user, refresh, signOut, regenerateAlias, updateBio } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState("");
  const [regenNote, setRegenNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await api.get<Post[]>(`/users/${user.id}/posts`);
      setPosts(rows);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); refresh(); }, [load, refresh]);
  useFocusEffect(useCallback(() => { load(); refresh(); }, [load, refresh]));
  useEffect(() => { if (user) setBio(user.bio ?? ""); }, [user]);

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
    } catch {
      // ignore
    }
  };

  const joined = user.joined_at ? new Date(user.joined_at).toLocaleDateString() : "";

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.banner}>
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

        <Text style={styles.sectionTitle}>Your posts</Text>
        {loading ? (
          <View style={{ padding: spacing.xl, alignItems: "center" }}><ActivityIndicator color={colors.brand} /></View>
        ) : posts.length === 0 ? (
          <EmptyState title="No posts yet." subtitle="Share your first thought from the Create tab." />
        ) : (
          <View style={{ paddingHorizontal: spacing.lg }}>
            {posts.map((p) => (
              <PostCard key={p.id} post={p} onChange={(u) => setPosts((prev) => prev.map((x) => x.id === u.id ? u : x))} compact />
            ))}
          </View>
        )}

        <View style={{ padding: spacing.lg }}>
          <Pressable style={styles.logoutBtn} onPress={signOut} testID="logout-btn">
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>
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
  smallBtn: {
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 8,
  },
  smallBtnGhost: { backgroundColor: colors.surfaceTertiary },
  smallBtnText: { color: "#FFF", fontWeight: "700" },
  sectionTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: font.base },
});
