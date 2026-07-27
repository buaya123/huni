import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheEntry } from "./types";

export const DiskCache = {

    async get<T>(key: string): Promise<CacheEntry<T> | null> {
        try {
            const json = await AsyncStorage.getItem(key);

            if (!json) return null;

            return JSON.parse(json);
        } catch {
            return null;
        }
    },

    async set<T>(key: string, entry: CacheEntry<T>) {
        await AsyncStorage.setItem(key, JSON.stringify(entry));
    },

    async remove(key: string) {
        await AsyncStorage.removeItem(key);
    },

    async clear() {
        await AsyncStorage.clear();
    },
    async keys() {
        return AsyncStorage.getAllKeys();
    },
    async multiRemove(keys: string[]) {

        if (!keys.length) return;

        await AsyncStorage.multiRemove(keys);

    },
    async exists(key: string) {

        return (await AsyncStorage.getItem(key)) !== null;

    },
};