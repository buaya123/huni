// src/repositories/ProfileRepository.ts

import { api } from "@/src/api/client";
import type { Post } from "@/src/models/Post";

export type CommentedPost = Post & {
    my_comment_preview?: string;
    my_comment_at?: string;
};

export type EquippedStyles = Record<
    string,
    {
        item_id: string;
        image_id: string | null;
        hex_color: string | null;
        name: string;
    } | null
>;

export class ProfileRepository {
    static async loadHeader(userId: string) {
    const [equipped, scannerPartners] = await Promise.all([
        api.get<EquippedStyles>("/me/equipped_styles").catch(() => ({})),
        api.get<any[]>("/scanner/partners").catch(() => []),
    ]);

    return {
        equipped,
        scannerPartners,
    };
}

static async loadPosts(
    userId: string,
    offset = 0,
    limit = 30
) {
    return api.get<Post[]>(
        `/users/${userId}/posts?offset=${offset}&limit=${limit}`
    );
}

static async loadComments(
    userId: string,
    offset = 0,
    limit = 30
) {
    return api.get<CommentedPost[]>(
        `/users/${userId}/commented-posts?offset=${offset}&limit=${limit}`
    );
}

static async loadListened(
    offset = 0,
    limit = 30
) {
    const rows = await api.get<Post[]>(
        `/me/bookmarks?offset=${offset}&limit=${limit}`
    );

    return [...rows].reverse();
}
}