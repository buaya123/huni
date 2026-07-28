import { api } from "@/src/api/client";
import {
    Cache,
    CacheKeys,
    CachePolicy,
    CacheStrategy,
} from "../cache";
import type { Notification } from "@/src/models/Notification";
// Replace this with your real notification type later


export class NotificationsRepository {

    static async list(
    offset = 0,
    limit = 30
): Promise<Notification[]> {

    // Only cache the first page
    if (offset === 0) {
        return Cache.get(
            CacheKeys.notifications,
            () =>
                api.get<Notification[]>(
                    `/notifications?offset=${offset}&limit=${limit}`
                ),
            {
                ttl: CachePolicy.notifications,
                strategy: CacheStrategy.StaleWhileRevalidate,
            }
        );
    }

    // Additional pages should never be cached
    return api.get<Notification[]>(
        `/notifications?offset=${offset}&limit=${limit}`
    );
}

    static async refresh() {

        return Cache.refresh(

            CacheKeys.notifications,

            () =>
                api.get<Notification[]>(
                    "/notifications?offset=0&limit=30"
                )

        );

    }

    static subscribe(
        callback: (data: Notification[]) => void,
    ) {

        return Cache.subscribe(

            CacheKeys.notifications,

            callback

        );

    }

    static invalidate() {

        return Cache.invalidate(
            CacheKeys.notifications
        );

    }

    static async markAllRead(): Promise<void> {

    await api.post("/notifications/read-all");

    await this.refresh();

}


}