import { api } from "@/src/api/client";
import type { Post } from "@/src/models/Post";
import { Cache, CacheKeys } from "@/src/cache";


export class PostRepository {

static async react(
    postId: string,
    kind: string,
): Promise<Post> {

    return api.post<Post>(
        `/posts/${postId}/react`,
        { kind }
    );

}

    static async toggleBookmark(
    post: Post,
): Promise<Post> {

    const r = await api.post<{ is_bookmarked: boolean }>(
        `/posts/${post.id}/bookmark`
    );

    const updated = {
        ...post,
        is_bookmarked: r.is_bookmarked,
        bookmark_count:
            (post.bookmark_count ?? 0) +
            (r.is_bookmarked ? 1 : -1),
    };

    return updated;

}

static async votePulse(
    postId: string,
    optionIndex: number,
): Promise<Post> {

    return api.post<Post>(
        `/posts/${postId}/pulse-vote`,
        {
            option_index: optionIndex,
        },
    );

}

static async delete(
    postId: string,
): Promise<void> {
    await api.del(`/posts/${postId}`);
}

static async get(
    postId: string,
): Promise<Post> {

    return api.get<Post>(`/posts/${postId}`);

}


}