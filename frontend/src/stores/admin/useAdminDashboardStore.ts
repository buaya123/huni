import { create } from "zustand";
import { AdminSettingsRepository } from "@/src/repositories/AdminSettingsRepository";
import { AdminCampaignRepository } from "@/src/repositories/AdminCampaignRepository";
import { AdsRepository } from "@/src/repositories/AdsRepository";
import type { AdminCampaign } from "@/src/types/admin";
import AdminReportsRepository from "@/src/repositories/AdminReportsRepository";
import type { AdminReport } from "@/src/types/admin";

const PAGE_SIZE = 10;

type AdminAd = {
    id: string;
    business_name: string;
    title: string;
    enabled: boolean;
    frequency_weight: number;
    stats: {
        impressions: number;
        clicks: number;
        ctr: number;
    };
    advertiser?: {
        alias: string;
        email: string;
    } | null;
};

interface AdminDashboardState {

    loading: boolean;

    everyN: number | null;

    ads: AdminAd[];

    campaigns: AdminCampaign[];

    reports: AdminReport[];

    reportsOffset: number;
    reportsHasMore: boolean;
    reportsLoadingMore: boolean;

    campaignsOffset: number;
    campaignsHasMore: boolean;
    campaignsLoadingMore: boolean;

    load: () => Promise<void>;

    loadReports: (reset?: boolean) => Promise<void>;
    loadMoreReports: () => Promise<void>;

    loadCampaigns: (reset?: boolean) => Promise<void>;
    loadMoreCampaigns: () => Promise<void>;

    updateEveryN: (value: number) => Promise<void>;

    toggleAd: (
        ad: AdminAd,
        enabled: boolean
    ) => Promise<void>;

    setCampaigns: (
        campaigns: AdminCampaign[]
    ) => void;

}

export const useAdminDashboardStore =
create<AdminDashboardState>((set, get) => ({
    
    loading: true,

    everyN: null,
    ads: [],
    campaigns: [],
    campaignsOffset: 0,
campaignsHasMore: true,
campaignsLoadingMore: false,

    reports: [],
        reportsOffset: 0,
reportsHasMore: true,
reportsLoadingMore: false,

    load: async () => {
    set({ loading: true });

    try {
        const [settings, ads] = await Promise.all([
            AdminSettingsRepository.get(),
            AdsRepository.getAll(),
        ]);

        set({
            everyN: settings.ad_every_n_posts,
            ads,
        });

        await Promise.all([
            get().loadReports(true),
            get().loadCampaigns(true),
        ]);

    } finally {
        set({
            loading: false,
        });
    }
},

    loadReports: async (reset = false) => {

    const state = get();

    if (state.reportsLoadingMore)
        return;

    if (!reset && !state.reportsHasMore)
        return;

    set({
        reportsLoadingMore: true,
    });

    try {

        const offset =
            reset
                ? 0
                : state.reportsOffset;

        const rows =
            await AdminReportsRepository.getReports(
                offset,
                PAGE_SIZE
            );

        set((state) => ({
    reports: reset
        ? rows
        : [...state.reports, ...rows],

    reportsOffset: offset + rows.length,
    reportsHasMore: rows.length === PAGE_SIZE,
}));

    } finally {

        set({
            reportsLoadingMore: false,
        });

    }

},
loadMoreReports: async () => {

    await get().loadReports(false);

},
loadCampaigns: async (reset = false) => {

    const state = get();

    if (state.campaignsLoadingMore)
        return;

    if (!reset && !state.campaignsHasMore)
        return;

    set({
        campaignsLoadingMore: true,
    });

    try {

        const offset =
            reset
                ? 0
                : state.campaignsOffset;

        const rows =
            await AdminCampaignRepository.getAll(
                offset,
                PAGE_SIZE
            );

        set((state) => ({

    campaigns: reset
        ? rows
        : [...state.campaigns, ...rows],

    campaignsOffset:
        offset + rows.length,

    campaignsHasMore:
        rows.length === PAGE_SIZE,

}));

    } finally {

        set({
            campaignsLoadingMore: false,
        });

    }

},
loadMoreCampaigns: async () => {

    await get().loadCampaigns(false);

},

    updateEveryN: async (value) => {

        const clamped = Math.min(
            20,
            Math.max(2, value)
        );

        set({
            everyN: clamped,
        });

        try {
            await AdminSettingsRepository.update({
                ad_every_n_posts: clamped,
            });
        } catch {}
    },

    toggleAd: async (ad, enabled) => {

        set((state) => ({
            ads: state.ads.map((a) =>
                a.id === ad.id
                    ? { ...a, enabled }
                    : a
            ),
        }));

        try {
            await AdsRepository.update(
                ad.id,
                { enabled }
            );
        } catch {

            set((state) => ({
                ads: state.ads.map((a) =>
                    a.id === ad.id
                        ? {
                              ...a,
                              enabled: !enabled,
                          }
                        : a
                ),
            }));

        }
    },
    

    setCampaigns: (campaigns) =>
    set({ campaigns }),


}));