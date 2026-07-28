import { api } from "@/src/api/client";
import type {
    AdminCampaign,
    ApproveCampaignRequest,
    RejectCampaignRequest,
} from "@/src/types/admin";

export class AdminCampaignRepository {
    static async getAll(): Promise<AdminCampaign[]> {
        return api.get<AdminCampaign[]>(
            "/admin/campaigns"
        );
    }

    static async approve(
        id: string,
        request: ApproveCampaignRequest,
    ): Promise<void> {
        await api.post(
            `/admin/campaigns/${id}/approve`,
            request,
        );
    }

    static async reject(
        id: string,
        request: RejectCampaignRequest,
    ): Promise<void> {
        await api.post(
            `/admin/campaigns/${id}/reject`,
            request,
        );
    }
}