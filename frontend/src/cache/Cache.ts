import { DiskCache } from "./DiskCache";
import { MemoryCache } from "./MemoryCache";
import {
    CacheEntry,
    CacheOptions,
    CacheStrategy,
} from "./types";



export class Cache {
    private static pending = new Map<
        string,
        Promise<unknown>
    >();

    private static listeners = new Map<
        string,
        Set<(data: any) => void>
    >();

    private static log(...args: unknown[]) {

        if (!__DEV__) return;

        console.log("[Cache]", ...args);

    }
    

    static async get<T>(
        key: string,
        fetcher: () => Promise<T>,
        options: CacheOptions,
    ): Promise<T> {

        const {
            ttl,
            strategy = CacheStrategy.CacheFirst,
            forceRefresh = false,
        } = options;

        if (forceRefresh) {
            return this.fetchAndStore(key, fetcher);
        }

        switch (strategy) {

            case CacheStrategy.CacheOnly:
                return this.getCacheOnly(key);

            case CacheStrategy.NetworkOnly:
                return this.fetchAndStore(key, fetcher);

            case CacheStrategy.NetworkFirst:
                return this.networkFirst(
                    key,
                    fetcher,
                    ttl,
                );

            case CacheStrategy.StaleWhileRevalidate:
                return this.staleWhileRevalidate(
                    key,
                    fetcher,
                    ttl,
                );

            case CacheStrategy.CacheFirst:
            default:
                return this.cacheFirst(
                    key,
                    fetcher,
                    ttl,
                );
        }
    }

    static async invalidate(key: string) {
        MemoryCache.remove(key);
        await DiskCache.remove(key);
    }

    static async clear() {
        MemoryCache.clear();
        await DiskCache.clear();
    }

    // ------------------------

    private static async cacheFirst<T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl: number,
    ): Promise<T> {

        const cached = await this.read<T>(key);

        if (cached && !this.expired(cached, ttl)) {
            return cached.data;
        }

        return this.fetchAndStore(key, fetcher);
    }

    // ------------------------

    private static async networkFirst<T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl: number,
    ): Promise<T> {

        try {
            return await this.fetchAndStore(key, fetcher);
        } catch {

            const cached = await this.read<T>(key);

            if (cached) {
                return cached.data;
            }

            throw new Error("No cache available.");
        }
    }

    // ------------------------

    private static async staleWhileRevalidate<T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl: number,
    ): Promise<T> {

        const cached = await this.read<T>(key);

        if (!cached) {
            return this.fetchAndStore(key, fetcher);
        }

        if (!this.expired(cached, ttl)) {
            return cached.data;
        }

        this.fetchAndStore(key, fetcher).catch(() => {});

        return cached.data;
    }

    // ------------------------

    private static async getCacheOnly<T>(
        key: string,
    ): Promise<T> {

        const cached = await this.read<T>(key);

        if (!cached) {
            throw new Error("No cache available.");
        }

        return cached.data;
    }

    // ------------------------

    private static async fetchAndStore<T>(
        key: string,
        fetcher: () => Promise<T>,
    ): Promise<T> {

        const existing = this.pending.get(key) as Promise<T> | undefined;

        if (existing) {
            return existing;
        }

        const request = (async () => {

            const data = await fetcher();
            this.log("Network Fetch", key);
            await this.store(key, data);

            return data;

        })();

        this.pending.set(key, request);

        try {
            return await request;
        } finally {
            this.pending.delete(key);
        }
    }

  // ------------------------

    static async store<T>(
        key: string,
        data: T,
    ) {

        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
        };

        MemoryCache.set(key, entry);

        await DiskCache.set(key, entry);

        this.log("Store", key);

        this.notify(key, data);
    }

    // ------------------------

    private static async read<T>(
    key: string,
): Promise<CacheEntry<T> | null> {

    const memory = MemoryCache.get<T>(key);

    if (memory) {
        this.log("Memory Hit", key);
        return memory;
    }

    const disk = await DiskCache.get<T>(key);

    if (disk) {
        this.log("Disk Hit", key);

        MemoryCache.set(key, disk);

        return disk;
    }

    this.log("Cache Miss", key);

    return null;
}

    // ------------------------

    private static expired<T>(
        entry: CacheEntry<T>,
        ttl: number,
        ) {
            return Date.now() - entry.timestamp > ttl;
        }

        // ------------------------

    static subscribe<T>(
        key: string,
        callback: (data: T) => void,
    ) {

        let listeners = this.listeners.get(key);

        if (!listeners) {
            listeners = new Set();
            this.listeners.set(key, listeners);
        }

        listeners.add(callback as (data: any) => void);

        return () => {

            listeners?.delete(callback as (data: any) => void);

            if (listeners?.size === 0) {
                this.listeners.delete(key);
            }
        };
    }

// ------------------------

private static notify<T>(
        key: string,
        data: T,
    ) {

        const listeners = this.listeners.get(key);

        if (!listeners) return;

        for (const listener of listeners) {
            listener(data);
        }
    }

// ------------------------

static peek<T>(key: string): T | null {

    const cached = MemoryCache.get<T>(key);

    return cached?.data ?? null;

}


// ------------------------

static async exists(
    key: string,
): Promise<boolean> {

    if (MemoryCache.get(key)) {
        return true;
    }

    return DiskCache.exists(key);

}

// ------------------------

static async hasFresh(
    key: string,
    ttl: number,
): Promise<boolean> {

    const cached = await this.read(key);

    if (!cached) return false;

    return !this.expired(cached, ttl);

}

// ------------------------

static async update<T>(
    key: string,
    updater: (data: T) => T,
) {

    const cached = await this.read<T>(key);

    if (!cached) return;

    const updated = updater(cached.data);

    await this.store(key, updated);

}

// ------------------------

static async refresh<T>(
    key: string,
    fetcher: () => Promise<T>,
) {

    return this.fetchAndStore(
        key,
        fetcher,
    );

}


}