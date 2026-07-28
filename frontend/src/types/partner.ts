export interface CreateCampaignRequest {
    title: string;
    description: string;
    discount_label: string;
    terms: string;
    start_date: string | null;
    end_date: string | null;
    redemption_policy: string;
    cooldown_value: number;
    cooldown_unit: string;
    visible_to: string;
    allowed_partners: string[];
}

export interface CreateCampaignRequest {
    title: string;
    description: string;
    discount_label: string;
    terms: string;
    start_date: string | null;
    end_date: string | null;
    redemption_policy: string;
    cooldown_value: number;
    cooldown_unit: string;
    visible_to: string;
    allowed_partners: string[];
}

export interface AddScannerRequest {
    user_id: string;
}

export interface RedeemRequest {
    campaign_id: string;
    user_id: string;
    partner_id?: string;
    note?: string;
}