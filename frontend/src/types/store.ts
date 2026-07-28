export interface StoreItem {
    id: string;
    category: string;
    subcategory: string;
    name: string;
    description: string;
    price_tokens: number;
    stock: number;
    enabled: boolean;
    active_from?: string | null;
    active_until?: string | null;
    sort_order: number;
    image_id?: string | null;
    hex_color?: string | null;
}

export interface CategoryDef {
    id: string;
    label: string;
    icon: string;
}

export interface CategoriesResponse {
    categories: Record<string, CategoryDef[]>;
}

export interface CreateStoreItemRequest {
    category: string;
    subcategory: string;
    name: string;
    description: string;
    price_tokens: number;
    stock: number;
    enabled: boolean;
    active_from: string | null;
    active_until: string | null;
    sort_order: number;
    image_id: string | null;
    hex_color: string | null;
}

export interface UpdateStoreItemRequest
    extends Partial<CreateStoreItemRequest> {}

    export interface CreateStoreItemRequest {
    category: string;
    subcategory: string;
    name: string;
    description: string;
    price_tokens: number;
    stock: number;
    enabled: boolean;
    active_from: string | null;
    active_until: string | null;
    sort_order: number;
    image_id: string | null;
    hex_color: string | null;
}

export interface UpdateStoreItemRequest
    extends Partial<CreateStoreItemRequest> {}