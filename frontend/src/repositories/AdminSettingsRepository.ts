import { api } from "@/src/api/client";
import type {
    AdminSettings,
    UpdateAdminSettingsRequest,
} from "@/src/types/admin";

export class AdminSettingsRepository {
    static async get(): Promise<AdminSettings> {
        return api.get<AdminSettings>(
            "/admin/settings"
        );
    }

    static async update(
        request: UpdateAdminSettingsRequest,
    ): Promise<void> {
        await api.patch(
            "/admin/settings",
            request,
        );
    }
}