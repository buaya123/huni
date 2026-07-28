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
import { PostCard, type Post } from "@/src/components/PostCard";
import { AdCard, type Ad } from "@/src/components/AdCard";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import { FeedSkeleton } from "@/src/components/FeedSkeleton";
import { FeedRepository } from "@/src/repositories/FeedRespository"

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [loadingMore, setLoadingMore] = useState(false);
  const listRef = useRef<FlatList<FeedItem>>(null);
  const firstVisiblePost = useRef<
      Record<(typeof TABS)[number]["key"], string | null>
  >({
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


  

type FeedCache = {
    posts: FeedItem[];
    offset: number;
    hasMore: boolean;
    lastFetched: number;
};

const emptyFeed: FeedCache = {
    posts: [],
    offset: 0,
    hasMore: true,
    lastFetched: 0
};

const [feeds, setFeeds] = useState<
    Record<
        (typeof TABS)[number]["key"],
        FeedCache
    >
>({
    latest: { ...emptyFeed },
    trending: { ...emptyFeed },
    nearby: { ...emptyFeed },
    pulse: { ...emptyFeed },
});

const currentFeed = feeds[tab];

const load = useCallback(async () => {



    try {

        const feed =
            await FeedRepository.load<FeedItem>(
                tab,
                PAGE_SIZE,
            );

        setFeeds(prev => ({
            ...prev,
            [tab]: feed,
        }));

    } catch {

        setFeeds(prev => ({
            ...prev,
            [tab]: {
                posts: [],
                offset: 0,
                hasMore: false,
                lastFetched: Date.now(),
            },
        }));

    } finally {

        setLoading(false);

    }

}, [tab]);

const loadMore = useCallback(async () => {

   if (
        loadingMore ||
        loading ||
        refreshing ||
        !currentFeed.hasMore
    ) {
        return;
    }

    try {

        setLoadingMore(true);

        const nextFeed = await FeedRepository.loadMore<FeedItem>(
            tab,
            currentFeed,
            PAGE_SIZE,
        );

        setFeeds(prev => ({
            ...prev,
            [tab]: nextFeed,
        }));

    } finally {

        setLoadingMore(false);

    }

}, [
    tab,
    loading,
    loadingMore,
    currentFeed,
]);

useEffect(() => {

    if (currentFeed.posts.length === 0) {
        setLoading(true);
        load();
    } else {
        setLoading(false);
    }

}, [tab]);





const onRefresh = useCallback(async () => {

    if (refreshing || loading) {
        return;
    }

    setRefreshing(true);

    try {

        await load();

    } finally {

        setRefreshing(false);

    }

}, [refreshing, loading, load]);

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


    

    if ((item as any).type === "ad") {

        return <AdCard ad={item as Ad} />;

    }

    if (!(item as any).id) {

        return null;

    }

    return (

        <PostCard
            post={item as Post}
            onChange={(updated) =>{
                console.log("FEED RECEIVED", updated);
                setFeeds(prev => ({
    ...prev,
    [tab]: {
        ...prev[tab],
        posts: prev[tab].posts.map(p =>
            p.id === updated.id &&
            p.type !== "ad"
                ? updated
                : p
        ),
    },
}))
            }}
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
