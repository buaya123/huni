import { api } from "@/src/api/client";
import type { Campaign } from "@/app/perks/index";
import type {
    AddScannerRequest,
    CreateCampaignRequest,
    RedeemRequest,
} from "@/src/types/partner";
export class PartnerRepository {

    static async createCampaign(
    payload: CreateCampaignRequest,
) {
    return api.post("/partner/campaigns", payload);
}

    static async updateCampaign(
        campaignId: string,
        payload: {
            enabled: boolean;
        },
    ) {
        return api.patch(
            `/partner/campaigns/${campaignId}`,
            payload,
        );
    }

    static async deleteCampaign(
        campaignId: string,
    ) {
        return api.del(
            `/partner/campaigns/${campaignId}`,
        );
    }

    static async addScanner(
        payload: AddScannerRequest,
    ) {
        return api.post(
            "/partner/scanners",
            payload,
        );
    }

    static async removeScanner(
        scannerId: string,
    ) {
        return api.del(
            `/partner/scanners/${scannerId}`,
        );
    }

    static async redeem(
        payload: RedeemRequest,
    ) {
        return api.post(
            "/partner/redeem",
            payload,
        );
    }

    static async getCampaign(
        campaignId: string,
    ) {
        return api.get<Campaign>(
            `/partner/campaigns/${campaignId}`,
        );
    }

}