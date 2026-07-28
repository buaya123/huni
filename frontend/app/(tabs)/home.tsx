import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

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
import { SafeAreaView } from "react-native-safe-area-context";
import type { Post } from "@/src/models/Post";
import { PostCard } from "@/src/components/PostCard";
import { AdCard, type Ad } from "@/src/components/AdCard";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import { FeedSkeleton } from "@/src/components/FeedSkeleton";
import { useFeedStore } from "@/src/stores/feed/useFeedStore";
import { PAGE_SIZE } from "@/src/stores/feed/feed.constants";
import { FeedTab } from "@/src/stores/feed/feed.types";
import { FeedRepository } from "@/src/repositories/FeedRespository";
import {
    FeedCache,
    FeedItem,
    emptyFeed,
} from "@/src/stores/feed/feed.types";


const TABS: { key: "latest" | "trending" | "nearby" | "pulse"; label: string }[] = [
  { key: "latest", label: "Latest" },
  { key: "trending", label: "Trending" },
  { key: "nearby", label: "Nearby" },
  { key: "pulse", label: "Pulse" },
];



export default function Home() {
const {
    tab,
    setTab,
    loading,
    refreshing,
    loadingMore,
    feeds,
    updatePost,
    refresh
} = useFeedStore();

const {
    react,
    toggleBookmark,
    votePulse,
} = useFeedStore();

  const { load } = useFeedStore();

  const listRef = useRef<FlatList<FeedItem>>(null);
  const firstVisiblePost = useRef<Record<FeedTab, string | null>>({
      latest: null,
      trending: null,
      nearby: null,
      pulse: null,
  });
  const viewabilityConfig = useRef({
      itemVisiblePercentThreshold: 50,
  });

const onViewableItemsChanged = useRef(
    ({ viewableItems }: any) => {

        const firstPost = viewableItems.find(
            (v: any) =>
                v.item.type !== "ad"
        );

        if (firstPost) {

            firstVisiblePost.current[tab] =
                firstPost.item.id;

        }

    }
);

const currentFeed = feeds[tab];

const handleLoad = useCallback(async () => {
    await load();
}, [load]);

const { loadMore } = useFeedStore();

useEffect(() => {
    if (currentFeed.posts.length === 0) {
        handleLoad();
    }
}, [tab, currentFeed.posts.length, handleLoad]);





const onRefresh = useCallback(async () => {
    if (refreshing || loading) {
        return;
    }

    await refresh();
}, [refreshing, loading, refresh]);

const ids = currentFeed.posts.map(p => p.id);

const duplicateIds = ids.filter(
    (id, index) => ids.indexOf(id) !== index
);

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

          <View
              style={{
                  padding: spacing.lg,
              }}
          >
              <FeedSkeleton />
              <FeedSkeleton />
              <FeedSkeleton />
          </View>

      ) : (
        
        <FlatList
          ref={listRef}
          
          onEndReached={() => {
              if (!refreshing) {
                  loadMore();
              }
          }}
          onEndReachedThreshold={0.6}
          scrollEventThrottle={16}
          testID="feed-list"
          data={currentFeed.posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={
              <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.brand}
                  progressViewOffset={56}
              />
          }
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

          viewabilityConfig={
              viewabilityConfig.current
          }

          onViewableItemsChanged={
              onViewableItemsChanged.current
          }
          
          renderItem={({ item }) => {


    

    if (item.type === "ad") {
    return (
        <AdCard
            ad={item}
        />
    );
}

    if (!(item as any).id) {

        return null;

    }

    return (

        <PostCard
        post={item}
        onReact={(kind) => react(item.id, kind)}
        onBookmark={() => toggleBookmark(item.id)}
        onVotePulse={(index) => votePulse(item.id, index)}
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
