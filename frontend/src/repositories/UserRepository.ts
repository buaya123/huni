import { api } from "@/src/api/client";
import type { Post } from "@/src/models/Post";

import type {
    Profile,
    EquippedStyles,
    BlockRow,
} from "@/src/types/user";

export class UserRepository {

    static async get(id: string): Promise<Profile> {
        return api.get(`/users/${id}`);
    }

    static async getPosts(
        id: string,
    ): Promise<Post[]> {
        return api.get(`/users/${id}/posts`);
    }

static async getEquippedStyles(
    id: string,
): Promise<EquippedStyles> {
    try {
        return await api.get<EquippedStyles>(
            `/users/${id}/equipped_styles`
        );
    } catch {
        return {};
    }
}

    static async block(
        targetUserId: string,
    ): Promise<void> {
        await api.post("/block", {
            target_user_id: targetUserId,
        });
    }

    static async getBlockedUsers(): Promise<BlockRow[]> {
        return api.get("/block");
    }

    static async unblock(
        targetUserId: string,
    ): Promise<void> {
        await api.del(`/block/${targetUserId}`);
    }

}

