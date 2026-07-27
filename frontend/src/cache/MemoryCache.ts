import { CacheEntry } from "./types";

const memory = new Map<string, CacheEntry<any>>();

export const MemoryCache = {
    get<T>(key: string): CacheEntry<T> | null {
        return memory.get(key) ?? null;
    },

    set<T>(key: string, value: CacheEntry<T>) {
        memory.set(key, value);
    },

    remove(key: string) {
        memory.delete(key);
    },

    clear() {
        memory.clear();
    },
    keys() {
    return [...memory.keys()];
},
};