import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { EmptyState } from "@/src/components/EmptyState";
import { PostCard, type Post } from "@/src/components/PostCard";
import { colors, font, spacing } from "@/src/theme/tokens";

export default function Bookmarks() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<Post[]>("/me/bookmarks");
      setPosts(rows);
    } catch { setPosts([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>My Bookmarks</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : posts.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <EmptyState
            title="No saved posts yet"
            subtitle="Tap the bookmark icon on any post to save it. You'll get notified when there's a new comment."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onChange={(u) => {
                if (!u.is_bookmarked) {
                  // remove locally if un-bookmarked from within this list
                  setPosts((prev) => prev.filter((x) => x.id !== u.id));
                } else {
                  setPosts((prev) => prev.map((x) => (x.id === u.id ? u : x)));
                }
              }}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
});
