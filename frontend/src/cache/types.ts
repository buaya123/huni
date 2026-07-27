export enum CacheStrategy {
    CacheFirst,
    NetworkFirst,
    StaleWhileRevalidate,
    CacheOnly,
    NetworkOnly,
}

export interface CacheOptions {

    ttl: number;

    strategy?: CacheStrategy;

    forceRefresh?: boolean;

    log?: boolean;

}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

