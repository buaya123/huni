import { api } from "@/src/api/client";

import type {
    CategoriesResponse,
    StoreItem,
    CreateStoreItemRequest,
    UpdateStoreItemRequest,
} from "@/src/types/store";

export class AdminStoreRepository {
    static async getCategories(): Promise<CategoriesResponse> {
        return api.get<CategoriesResponse>("/store/categories");
    }

    static async getItems(): Promise<StoreItem[]> {
        return api.get<StoreItem[]>("/admin/store/items");
    }

    static async create(
        payload: CreateStoreItemRequest,
    ): Promise<StoreItem> {
        return api.post<StoreItem>(
            "/admin/store/items",
            payload,
        );
    }

    static async update(
        id: string,
        payload: UpdateStoreItemRequest,
    ): Promise<StoreItem> {
        return api.patch<StoreItem>(
            `/admin/store/items/${id}`,
            payload,
        );
    }

    static async delete(
        id: string,
    ): Promise<{ status: string }> {
        return api.del(`/admin/store/items/${id}`);
    }

    
}