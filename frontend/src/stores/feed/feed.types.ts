import { Post } from "@/src/models/Post";
import { Ad } from "@/src/components/AdCard";

export type FeedTab =
    | "latest"
    | "trending"
    | "nearby"
    | "pulse";

export type FeedItem =
    | (Post & { type?: undefined })
    | Ad;

    export interface FeedCache {
    posts: FeedItem[];
    offset: number;
    hasMore: boolean;
    lastFetched: number;
}

export const emptyFeed: FeedCache = {
    posts: [],
    offset: 0,
    hasMore: true,
    lastFetched: 0,
};