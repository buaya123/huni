import type { Post } from "@/src/components/PostCard";

export type Profile = {
    id: string;
    alias: string;
    helpful_score: number;
    post_count: number;
    comment_count: number;
    bio: string;
    joined_at: string;
    exp?: number;
    points?: number;
    tokens?: number;
    rank_level?: number;
    rank_title?: string;
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

export type BlockRow = {
    id: string;
    user: {
        id: string;
        alias: string;
    };
    created_at: string;
};