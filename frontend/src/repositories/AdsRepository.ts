import { api } from "@/src/api/client";

import type {
    AdRow,
    Analytics,
    CreateAdRequest,
    UpdateAdRequest,
} from "@/src/types/ad";

export class AdsRepository {

    // Queries

    static async getMine(): Promise<AdRow[]> {
        return api.get<AdRow[]>("/ads/mine");
    }

    static async getAll(): Promise<AdRow[]> {
        return api.get<AdRow[]>("/admin/ads");
    }

    static async get(
        adId: string,
    ): Promise<Omit<AdRow, "stats">> {
        return api.get<Omit<AdRow, "stats">>(
            `/ads/${adId}`,
        );
    }

    static async getAnalytics(
        adId: string,
    ): Promise<Analytics> {
        return api.get<Analytics>(
            `/ads/${adId}/analytics`,
        );
    }

    // Commands

 static async create(
    payload: CreateAdRequest,
): Promise<Omit<AdRow, "stats">> {
    return api.post<Omit<AdRow, "stats">>(
        "/ads",
        payload,
    );
}

static async update(
    adId: string,
    payload: UpdateAdRequest,
): Promise<Omit<AdRow, "stats">> {
    return api.patch<Omit<AdRow, "stats">>(
        `/ads/${adId}`,
        payload,
    );
}

    static async delete(
        adId: string,
    ) {
        return api.del(
            `/ads/${adId}`,
        );
    }

    // Tracking

    static async trackImpression(
        adId: string,
    ) {
        return api.post(
            `/ads/${adId}/impression`,
        );
    }

    static async trackClick(
        adId: string,
    ) {
        return api.post(
            `/ads/${adId}/click`,
        );
    }
}