import { create } from "zustand";
import { FeedCache, FeedTab, emptyFeed } from "./feed.types";
import { FeedRepository } from "@/src/repositories/FeedRespository";
import { FeedItem } from "./feed.types";
import { PAGE_SIZE } from "./feed.constants";
import { Post } from "@/src/models/Post";
import { PostRepository } from "@/src/repositories/PostRepository";
interface FeedState {
    // UI State
    tab: FeedTab;
    loading: boolean;
    refreshing: boolean;
    loadingMore: boolean;

    // Data
    feeds: Record<FeedTab, FeedCache>;

    // Setters
    setTab: (tab: FeedTab) => void;
    setFeed: (tab: FeedTab, feed: FeedCache) => void;

    load: () => Promise<void>;
    loadMore: () => Promise<void>;
    refresh: () => Promise<void>;
    updatePost: (post: FeedItem) => void;

    react(postId: string, kind: string): Promise<void>;
    toggleBookmark(postId: string): Promise<void>;
    votePulse(postId: string, index: number): Promise<void>;
    getPost(postId: string): Post | undefined;
    loadPost: (postId: string) => Promise<Post>;
}


function replacePost(
    feed: FeedCache,
    postId: string,
    updater: (post: Post) => Post
): FeedCache {
    return {
        ...feed,
        posts: feed.posts.map((item) => {
            if (item.type === "ad") {
                return item;
            }

            return item.id === postId
                ? updater(item)
                : item;
        }),
    };
}

function optimisticReact(post: Post, kind: string): Post {
    const reactions = { ...(post.reactions ?? {}) };

    const previousReaction = post.my_reaction;

    if (previousReaction) {
        reactions[previousReaction] = Math.max(
            0,
            (reactions[previousReaction] ?? 1) - 1
        );
    }

    if (previousReaction === kind) {
        return {
            ...post,
            my_reaction: null,
            reactions,
            reaction_total: Math.max(0, post.reaction_total - 1),
        };
    }

    reactions[kind] = (reactions[kind] ?? 0) + 1;

    return {
        ...post,
        my_reaction: kind,
        reactions,
        reaction_total:
            previousReaction == null
                ? post.reaction_total + 1
                : post.reaction_total,
    };
}

function optimisticBookmark(post: Post): Post {
    return {
        ...post,
        is_bookmarked: !post.is_bookmarked,
    };
}

export const useFeedStore = create<FeedState>((set, get) => ({
    tab: "latest",

    loading: true,
    refreshing: false,
    loadingMore: false,

    feeds: {
        latest: { ...emptyFeed },
        trending: { ...emptyFeed },
        nearby: { ...emptyFeed },
        pulse: { ...emptyFeed },
    },

    setTab: (tab) => set({ tab }),

    setFeed: (tab, feed) =>
        set((state) => ({
            feeds: {
                ...state.feeds,
                [tab]: feed,
            },
        })),



    load: async () => {
        set({ loading: true });
    const { tab } = useFeedStore.getState();

    try {
        const feed = await FeedRepository.load<FeedItem>(
            tab,
            PAGE_SIZE,
        );

        set((state) => ({
            feeds: {
                ...state.feeds,
                [tab]: feed,
            },
        }));
    } catch {
        set((state) => ({
            feeds: {
                ...state.feeds,
                [tab]: {
                    posts: [],
                    offset: 0,
                    hasMore: false,
                    lastFetched: Date.now(),
                },
            },
        }));
    } finally {
        set({ loading: false });
    }
},

    loadMore: async () => {
    const {
        loadingMore,
        loading,
        refreshing,
        tab,
        feeds,
    } = useFeedStore.getState();

    const currentFeed = feeds[tab];

    if (
        loadingMore ||
        loading ||
        refreshing ||
        !currentFeed.hasMore
    ) {
        return;
    }

    try {
        set({ loadingMore: true });

        const nextFeed = await FeedRepository.loadMore<FeedItem>(
            tab,
            currentFeed,
            PAGE_SIZE,
        );

        set((state) => ({
            feeds: {
                ...state.feeds,
                [tab]: nextFeed,
            },
        }));

    } finally {
        set({ loadingMore: false });
    }
},

    refresh: async () => {
    set({ refreshing: true });

    const { tab } = useFeedStore.getState();

    try {
        const feed = await FeedRepository.load<FeedItem>(
            tab,
            PAGE_SIZE,
        );

        set((state) => ({
            feeds: {
                ...state.feeds,
                [tab]: feed,
            },
        }));
    } catch {
        // Keep the current feed if refresh fails.
    } finally {
        set({ refreshing: false });
    }
},

    updatePost: (post) => {
    const { tab } = useFeedStore.getState();

    set((state) => ({
        feeds: {
            ...state.feeds,
            [tab]: {
                ...state.feeds[tab],
                posts: state.feeds[tab].posts.map((p) =>
                    p.type !== "ad" && p.id === post.id
                        ? post
                        : p
                ),
            },
        },
    }));
},

getPost: (postId) => {
    const { feeds } = get();

    for (const feed of Object.values(feeds)) {

        const post = feed.posts.find(
            (item): item is Post =>
                item.type !== "ad" &&
                item.id === postId
        );

        if (post) {
            return post;
        }
    }

    return undefined;
},
react: async (postId, kind) => {
    const { tab, feeds } = get();

    const feed = feeds[tab];

    const previous = feed.posts.find(
        (p): p is Post =>
            p.type !== "ad" && p.id === postId
    );
    if (!previous) return;

    set((state) => ({
        feeds: {
            ...state.feeds,
            [tab]: replacePost(
                state.feeds[tab],
                postId,
                (post) => optimisticReact(post, kind)
            ),
        },
    }));

    try {
    const updated = await PostRepository.react(postId, kind);

    set((state) => ({
        feeds: {
            ...state.feeds,
            [tab]: replacePost(
                state.feeds[tab],
                postId,
                () => updated
            ),
        },
    }));
} catch {
    // rollback
    set((state) => ({
        feeds: {
            ...state.feeds,
            [tab]: replacePost(
                state.feeds[tab],
                postId,
                () => previous
            ),
        },
    }));
}

    
},

toggleBookmark: async (postId) => {
    const { tab, feeds } = get();

    const feed = feeds[tab];

    const previous = feed.posts.find(
        (p): p is Post =>
            p.type !== "ad" &&
            p.id === postId
    );

    if (!previous) return;

    set((state) => ({
        feeds: {
            ...state.feeds,
            [tab]: replacePost(
                state.feeds[tab],
                postId,
                optimisticBookmark
            ),
        },
    }));

    try {
        const updated =
    await PostRepository.toggleBookmark(previous);

        set((state) => ({
            feeds: {
                ...state.feeds,
                [tab]: replacePost(
                    state.feeds[tab],
                    postId,
                    () => updated
                ),
            },
        }));
    } catch {
        set((state) => ({
            feeds: {
                ...state.feeds,
                [tab]: replacePost(
                    state.feeds[tab],
                    postId,
                    () => previous
                ),
            },
        }));
    }
},

votePulse: async (postId, index) => {
    //console.log("vote", postId, index);
},

loadPost: async (postId) => {
    const cached = get().getPost(postId);

    if (cached) {
        return cached;
    }

    return await PostRepository.get(postId);
},


        
}));