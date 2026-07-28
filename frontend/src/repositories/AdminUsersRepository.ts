import { api } from "@/src/api/client";
import type {
    AdminUser,
    UpdateUserRoleRequest,
} from "@/src/types/admin";

export class AdminUsersRepository {
    static async search(
        query: string,
    ): Promise<AdminUser[]> {
        return api.get<AdminUser[]>(
            `/admin/users?q=${encodeURIComponent(query)}`
        );
    }

    static async updateRole(
        id: string,
        request: UpdateUserRoleRequest,
    ): Promise<void> {
        await api.post(
            `/admin/users/${id}/role`,
            request,
        );
    }
}