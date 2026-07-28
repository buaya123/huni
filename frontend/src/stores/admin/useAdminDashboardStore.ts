import { create } from "zustand";
import { AdminSettingsRepository } from "@/src/repositories/AdminSettingsRepository";
import { AdminCampaignRepository } from "@/src/repositories/AdminCampaignRepository";
import { AdsRepository } from "@/src/repositories/AdsRepository";
import type { AdminCampaign } from "@/src/types/admin";

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

    load: () => Promise<void>;

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
create<AdminDashboardState>((set) => ({

    loading: true,

    everyN: null,
    ads: [],
    campaigns: [],

    load: async () => {
        set({ loading: true });

        try {
            const [settings, ads, campaigns] =
                await Promise.all([
                    AdminSettingsRepository.get(),
                    AdsRepository.getAll(),
                    AdminCampaignRepository.getAll(),
                ]);

            set({
                everyN: settings.ad_every_n_posts,
                ads,
                campaigns,
            });
        } finally {
            set({ loading: false });
        }
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