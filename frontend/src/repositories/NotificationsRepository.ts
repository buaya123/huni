import { api } from "@/src/api/client";
import {
    Cache,
    CacheKeys,
    CachePolicy,
    CacheStrategy,
} from "../cache";

// Replace this with your real notification type later
export interface Notification {
    id: string;
    title: string;
    body: string;
}

export class NotificationsRepository {

    static async list() {

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

}