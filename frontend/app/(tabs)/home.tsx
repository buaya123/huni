import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { PostCard, type Post } from "@/src/components/PostCard";
import { AdCard, type Ad } from "@/src/components/AdCard";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

const PAGE_SIZE = 5;

type FeedItem = (Post & { type?: undefined }) | Ad;

const TABS: { key: "latest" | "trending" | "nearby" | "pulse"; label: string }[] = [
  { key: "latest", label: "Latest" },
  { key: "trending", label: "Trending" },
  { key: "nearby", label: "Nearby" },
  { key: "pulse", label: "Pulse" },
];

export default function Home() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("latest");
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

 const load = useCallback(async () => {

    try {

        const rows = await api.get<FeedItem[]>(
            `/posts?tab=${tab}&offset=0&limit=${PAGE_SIZE}`
        );

        setPosts(rows);

        setOffset(PAGE_SIZE);

        setHasMore(rows.length >= PAGE_SIZE);

    } catch {

        setPosts([]);

        setHasMore(false);

    } finally {

        setLoading(false);

        setRefreshing(false);

    }

}, [tab]);

const loadMore = useCallback(async () => {

    if (loadingMore || loading || !hasMore)
        return;

    try {

        setLoadingMore(true);

        const rows = await api.get<FeedItem[]>(
            `/posts?tab=${tab}&offset=${offset}&limit=${PAGE_SIZE}`
        );

        if (rows.length === 0) {

            setHasMore(false);
            return;

        }

        setPosts((prev) => [...prev, ...rows]);

        setOffset((prev) => prev + PAGE_SIZE);

        if (rows.length < PAGE_SIZE)
            setHasMore(false);

    } finally {

        setLoadingMore(false);

    }

}, [tab, offset, loadingMore, loading, hasMore]);

useEffect(() => {

    setPosts([]);

    setOffset(0);

    setHasMore(true);

    setLoading(true);

    load();

}, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brand}>Huni</Text>
        <Text style={styles.tagline}>Honest. Local. Things</Text>
      </View>

      <View style={styles.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
        >
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tab, active && styles.tabActive]}
                testID={`feed-tab-${t.key}`}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          testID="feed-list"
          data={posts}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListFooterComponent={
              loadingMore ? (
                  <View style={{ paddingVertical: 24 }}>
                      <ActivityIndicator color={colors.brand} />
                  </View>
              ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title="No stories here yet."
              subtitle="Be the first to share something in this tab."
            />
          }
          renderItem={({ item }) => {

    console.log("HOME ITEM", item);

    

    if ((item as any).type === "ad") {

        return <AdCard ad={item as Ad} />;

    }

    if (!(item as any).id) {

        console.log("INVALID ITEM", item);

        return null;

    }

    return (

        <PostCard
            post={item as Post}
            onChange={(updated) =>
                setPosts((prev) =>
                    prev.map((p) =>
                        p.id === updated.id && p.type !== "ad"
                            ? updated
                            : p
                    )
                )
            }
        />

    );

}}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  brand: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  tagline: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  tabsWrap: { height: 56, justifyContent: "center" },
  tab: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tabActive: { backgroundColor: colors.brand },
  tabText: { color: colors.onSurfaceTertiary, fontWeight: "600", fontSize: font.base },
  tabTextActive: { color: "#FFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
