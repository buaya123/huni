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

    static async list(): Promise<Notification[]> {

        return Cache.get<Notification[]>(

            CacheKeys.notifications,

            () => api.get<Notification[]>("/notifications"),

            {
                ttl: CachePolicy.notifications,
                strategy: CacheStrategy.StaleWhileRevalidate,
            }

        );

    }

    static async refresh() {

        return Cache.refresh(

            CacheKeys.notifications,

            () => api.get<Notification[]>("/notifications")

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