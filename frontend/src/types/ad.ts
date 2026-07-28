export interface AdStats {
    impressions: number;
    clicks: number;
    unique_viewers: number;
    ctr: number;
}

export interface AdRow {
    id: string;
    business_name: string;
    title: string;
    enabled: boolean;
    comments_enabled: boolean;
    frequency_weight: number;
    stats: AdStats;
}

export interface AdDailyStat {
    date: string;
    impressions: number;
    clicks: number;
}

export interface Analytics {
    ad: Omit<AdRow, "stats">;

    totals: AdStats;

    daily: AdDailyStat[];

    recent_clicks: string[];
}

export interface UpdateAdRequest {
    business_name?: string;
    title?: string;
    content?: string;
    frequency_weight?: number;
    enabled?: boolean;
    comments_enabled?: boolean;
    link_url?: string | null;
    image_ids?: string[];
}

export interface CreateAdRequest {
    business_name: string;
    title: string;
    content: string;
    frequency_weight: number;

    link_url?: string;
    image_ids?: string[];
}

export interface Ad {
    id: string;
    business_name: string;
    title: string;
    enabled: boolean;
    comments_enabled: boolean;
    frequency_weight: number;
}

export interface AdRow extends Ad {
    stats: AdStats;
}

export interface Analytics {
    ad: Ad;
    totals: AdStats;
    daily: AdDailyStat[];
    recent_clicks: string[];
}