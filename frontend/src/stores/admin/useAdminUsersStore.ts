import { create } from "zustand";
import { AdminUsersRepository } from "@/src/repositories/AdminUsersRepository";
import type { AdminUser } from "@/src/types/admin";

type PartnerPayload = {
    businessName: string;
    businessType: string;
};

interface AdminUsersState {
    query: string;
    users: AdminUser[];
    searching: boolean;

    setQuery: (query: string) => void;

    search: () => Promise<void>;

    updateRole: (
        user: AdminUser,
        role: "user" | "advertiser" | "partner"
    ) => Promise<void>;

    promotePartner: (
        userId: string,
        payload: PartnerPayload
    ) => Promise<void>;
}

export const useAdminUsersStore = create<AdminUsersState>((set, get) => ({
    query: "",
    users: [],
    searching: false,

    setQuery: (query) => set({ query }),

    search: async () => {
        set({ searching: true });

        try {
            const rows = await AdminUsersRepository.search(
                get().query.trim()
            );

            set({ users: rows });
        } catch {
            set({ users: [] });
        } finally {
            set({ searching: false });
        }
    },

    updateRole: async (user, role) => {
        await AdminUsersRepository.updateRole(user.id, {
            role,
        });

        set((state) => ({
            users: state.users.map((u) =>
                u.id === user.id
                    ? {
                          ...u,
                          role,
                      }
                    : u
            ),
        }));
    },

    promotePartner: async (userId, payload) => {
        await AdminUsersRepository.updateRole(userId, {
            role: "partner",
            business_name: payload.businessName.trim(),
            business_type: payload.businessType.trim(),
        });

        set((state) => ({
            users: state.users.map((u) =>
                u.id === userId
                    ? {
                          ...u,
                          role: "partner",
                      }
                    : u
            ),
        }));
    },
}));