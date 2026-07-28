import { create } from "zustand";
import { ProfileRepository } from "@/src/repositories/ProfileRepository";
import type { Post } from "@/src/models/Post";
import type { CommentedPost, EquippedStyles } from "@/src/repositories/ProfileRepository";

interface ProfileState {
    posts: Post[];
    commented: CommentedPost[];
    listened: Post[];
    equipped: EquippedStyles;
    scannerPartners: any[];

    loading: boolean;
    refreshing: boolean;


    load(userId: string): Promise<void>;
    setPosts: (posts: Post[]) => void;
    setListened: (posts: Post[]) => void;
    refresh(userId: string): Promise<void>;

    setCommented: (posts: CommentedPost[]) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
    posts: [],
    commented: [],
    listened: [],
    equipped: {},
    scannerPartners: [],


    loading: false,
    refreshing: false,
    

    load: async (userId) => {
        set({ loading: true });

        try {
            const [header, posts, commented, listened] = await Promise.all([
                ProfileRepository.loadHeader(userId),
                ProfileRepository.loadPosts(userId),
                ProfileRepository.loadComments(userId),
                ProfileRepository.loadListened(),
            ]);

            set({
                posts,
                commented,
                listened,
                equipped: header.equipped,
                scannerPartners: header.scannerPartners,
            });
        } finally {
            set({ loading: false });
        }
    },

    setPosts: (posts) => set({ posts }),

    setListened: (listened) => set({ listened }),
    
    refresh: async (userId) => {
    set({ refreshing: true });

    try {
        const [header, posts, commented, listened] = await Promise.all([
        ProfileRepository.loadHeader(userId),
        ProfileRepository.loadPosts(userId),
        ProfileRepository.loadComments(userId),
        ProfileRepository.loadListened(),
    ]);

    set({
        posts,
        commented,
        listened,
        equipped: header.equipped,
        scannerPartners: header.scannerPartners,
    });
    } finally {
        set({ refreshing: false });
    }
},
setCommented: (commented) => set({ commented }),

}));