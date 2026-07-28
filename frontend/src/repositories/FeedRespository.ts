import { api } from "@/src/api/client";

export type FeedTab =
    | "latest"
    | "trending"
    | "nearby"
    | "pulse";

export interface FeedState<T> {
    posts: T[];
    offset: number;
    hasMore: boolean;
    lastFetched: number;
}

export const emptyFeed = {
    posts: [],
    offset: 0,
    hasMore: true,
    lastFetched: 0,
};



export class FeedRepository {

    static async load<T extends { type?: string }>(
            tab: FeedTab,
            limit: number,
        ): Promise<FeedState<T>> {

            const rows =
                await api.get<T[]>(
                    `/posts?tab=${tab}&offset=0&limit=${limit}`
                );

            return this.buildState(
                rows,
                limit,
            );

        }

    static async loadMore<
    T extends { id: string; type?: string }
>(
    tab: FeedTab,
    current: FeedState<T>,
    limit: number,
): Promise<FeedState<T>> {

    const rows = await api.get<T[]>(
        `/posts?tab=${tab}&offset=${current.offset}&limit=${limit}`
    );

    if (rows.length === 0) {

        return {
            ...current,
            hasMore: false,
            lastFetched: Date.now(),
        };

    }

    const postCount =
        this.postCount(rows);

    const posts =
        this.merge(
            current.posts,
            rows,
        );

    return {
        posts,
        offset: current.offset + postCount,
        hasMore: this.hasMore(
            postCount,
            limit,
        ),
        lastFetched: Date.now(),
    };

}

    static async refresh<T extends { type?: string }>(
        tab: FeedTab,
        limit: number,
    ): Promise<FeedState<T>> {

        return this.load<T>(
            tab,
            limit,
        );

    }

    static merge<T extends { id: string }>(
        current: T[],
        incoming: T[],
    ): T[] {

        return Array.from(
            new Map(
                [...current, ...incoming]
                    .map(item => [item.id, item])
            ).values()
        );

    }

    static postCount(
        rows: { type?: string }[],
    ): number {

        return rows.filter(
            r => r.type !== "ad"
        ).length;

    }

    static hasMore(
        count: number,
        pageSize: number,
    ) {

        return count >= pageSize;

    }

    private static buildState<T extends { type?: string }>(
        rows: T[],
        pageSize: number,
    ): FeedState<T> {

        const postCount =
            rows.filter(
                r => r.type !== "ad"
            ).length;

        return {
            posts: rows,
            offset: postCount,
            hasMore: postCount >= pageSize,
            lastFetched: Date.now(),
        };

    }

    

}