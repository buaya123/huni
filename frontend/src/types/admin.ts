export type AdminRole =
    | "user"
    | "advertiser"
    | "partner"
    | "admin";

export interface AdminUser {
    id: string;
    alias: string;
    email: string;
    first_name: string;
    last_name: string;
    role: AdminRole;
}

export interface UpdateUserRoleRequest {
    role: Exclude<AdminRole, "admin">;
    business_name?: string;
    business_type?: string;
}

export interface AdminSettings {
    ad_every_n_posts: number;
}

export interface UpdateAdminSettingsRequest {
    ad_every_n_posts: number;
}

export interface AdminCampaign {
    id: string;
    title: string;
    description: string;
    discount_label: string;
    terms?: string;

    start_date?: string | null;
    end_date?: string | null;

    status: string;
    state: string;

    redemption_count: number;

    exp_per_redemption: number;
    tokens_per_redemption: number;

    budget_exp: number;
    budget_tokens: number;

    remaining_exp: number;
    remaining_tokens: number;

    created_at?: string;

    rejected_reason?: string | null;

    reward_type?: string;
    points_amount?: string;

    partner: {
        id: string;
        alias: string;
        business_name: string;
        business_type: string;
    } | null;
}

export interface ApproveCampaignRequest {
    exp_per_redemption: number;
    tokens_per_redemption: number;
    budget_exp: number;
    budget_tokens: number;
}

export interface RejectCampaignRequest {
    reason: string;
}