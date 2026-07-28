import { api } from "@/src/api/client";
import type { Comment } from "@/src/components/CommentsSection";

export type CommentState = {
    comments: Comment[];
    loading: boolean;
};

export class CommentRepository {

    static initialState(): CommentState {
    return {
        comments: [],
        loading: false,
    };
}
    

    static async getByPost(
        postId: string,
    ): Promise<Comment[]> {
        return api.get<Comment[]>(
            `/posts/${postId}/comments`
        );
    }

    static async create(
        postId: string,
        body: Record<string, unknown>,
    ): Promise<Comment> {
        return api.post<Comment>(
            `/posts/${postId}/comments`,
            body,
        );
    }

    static async react(
        commentId: string,
        kind: "up" | "down",
    ): Promise<Comment> {
        return api.post<Comment>(
            `/comments/${commentId}/react`,
            { kind },
        );
    }

    static async remove(
        commentId: string,
    ): Promise<void> {
        await api.del(
            `/comments/${commentId}`,
        );
    }

static add(
    state: CommentState,
    comment: Comment,
): CommentState {
    return {
        ...state,
        comments: [...state.comments, comment],
    };
}

static replace(
    state: CommentState,
    updated: Comment,
): CommentState {
    return {
        ...state,
        comments: state.comments.map(c =>
            c.id === updated.id ? updated : c
        ),
    };
}

static removeLocal(
    state: CommentState,
    commentId: string,
): CommentState {
    return {
        ...state,
        comments: state.comments.filter(
            c => c.id !== commentId
        ),
    };
}

}