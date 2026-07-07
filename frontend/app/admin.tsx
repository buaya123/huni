import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type AdminUser = {
  id: string;
  alias: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "user" | "advertiser" | "partner" | "admin";
};

type AdminAd = {
  id: string;
  business_name: string;
  title: string;
  enabled: boolean;
  frequency_weight: number;
  stats: { impressions: number; clicks: number; ctr: number };
  advertiser?: { alias: string; email: string } | null;
};

type AdminCampaign = {
  id: string;
  title: string;
  description: string;
  reward_type: "points" | "discount" | "both";
  points_amount: number;
  discount_label: string;
  status: string;
  state: string;
  redemption_count: number;
  rejected_reason?: string | null;
  partner: { id: string; alias: string; business_name: string; business_type: string } | null;
};

export default function AdminPanel() {
  const router = useRouter();
  const { user } = useAuth();
  const [everyN, setEveryN] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [ads, setAds] = useState<AdminAd[]>([]);
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [promotePartner, setPromotePartner] = useState<{ userId: string; businessName: string; businessType: string } | null>(null);

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    try {
      const [s, allAds, allCamps] = await Promise.all([
        api.get<{ ad_every_n_posts: number }>("/admin/settings"),
        api.get<AdminAd[]>("/admin/ads"),
        api.get<AdminCampaign[]>("/admin/campaigns"),
      ]);
      setEveryN(s.ad_every_n_posts);
      setAds(allAds);
      setCampaigns(allCamps);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const search = async () => {
    setSearching(true);
    try {
      const rows = await api.get<AdminUser[]>(`/admin/users?q=${encodeURIComponent(query.trim())}`);
      setUsers(rows);
    } catch {
      setUsers([]);
    } finally {
      setSearching(false);
    }
  };

  const setRole = async (u: AdminUser, role: "user" | "advertiser" | "partner") => {
    if (role === "partner") {
      setPromotePartner({ userId: u.id, businessName: "", businessType: "" });
      return;
    }
    try {
      await api.post(`/admin/users/${u.id}/role`, { role });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
    } catch { /* ignore */ }
  };

  const confirmPartnerPromotion = async () => {
    if (!promotePartner) return;
    try {
      await api.post(`/admin/users/${promotePartner.userId}/role`, {
        role: "partner",
        business_name: promotePartner.businessName.trim(),
        business_type: promotePartner.businessType.trim(),
      });
      setUsers((prev) => prev.map((x) => (x.id === promotePartner.userId ? { ...x, role: "partner" } : x)));
      setPromotePartner(null);
    } catch { /* ignore */ }
  };

  const approveCampaign = async (c: AdminCampaign) => {
    try {
      await api.post(`/admin/campaigns/${c.id}/approve`);
      setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "approved", state: "live" } : x)));
    } catch { /* ignore */ }
  };

  const rejectCampaign = async (c: AdminCampaign) => {
    Alert.prompt?.("Reject campaign", "Reason (optional):", async (reason?: string) => {
      try {
        await api.post(`/admin/campaigns/${c.id}/reject`, { reason: reason ?? "" });
        setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "rejected", state: "rejected", rejected_reason: reason ?? "" } : x)));
      } catch { /* ignore */ }
    });
    // Fallback for Android (Alert.prompt only on iOS)
    if (!Alert.prompt) {
      try {
        await api.post(`/admin/campaigns/${c.id}/reject`, { reason: "" });
        setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "rejected", state: "rejected" } : x)));
      } catch { /* ignore */ }
    }
  };

  const updateEveryN = async (val: number) => {
    const clamped = Math.min(20, Math.max(2, val));
    setEveryN(clamped);
    try {
      await api.patch("/admin/settings", { ad_every_n_posts: clamped });
    } catch { /* ignore */ }
  };

  const toggleAd = async (ad: AdminAd, value: boolean) => {
    setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, enabled: value } : a)));
    try {
      await api.patch(`/ads/${ad.id}`, { enabled: value });
    } catch {
      setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, enabled: !value } : a)));
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.wrap} edges={["top"]}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Admins only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))} hitSlop={12} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Admin Panel</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ad density</Text>
          <Text style={styles.hint}>Show 1 ad every N posts in the feed.</Text>
          <View style={styles.stepperRow}>
            <Pressable style={styles.stepBtn} onPress={() => everyN != null && updateEveryN(everyN - 1)} testID="density-minus">
              <Ionicons name="remove" size={18} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.weightValue} testID="density-value">{everyN ?? "…"}</Text>
            <Pressable style={styles.stepBtn} onPress={() => everyN != null && updateEveryN(everyN + 1)} testID="density-plus">
              <Ionicons name="add" size={18} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advertisers</Text>
          <Text style={styles.hint}>Search users to grant or revoke the advertiser role.</Text>
          <View style={styles.searchRow}>
            <TextInput
              testID="admin-user-search"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              placeholder="Search by email or alias..."
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={styles.input}
            />
            <Pressable style={styles.searchBtn} onPress={search} testID="admin-search-btn">
              {searching ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="search" size={18} color="#FFF" />}
            </Pressable>
          </View>
          {users.map((u) => (
            <View key={u.id} style={styles.userRow} testID={`admin-user-${u.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userAlias}>{u.alias}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
              </View>
              <View style={[
                styles.roleChip,
                u.role === "admin" && styles.roleChipAdmin,
                u.role === "advertiser" && styles.roleChipAdv,
                u.role === "partner" && styles.roleChipPartner,
              ]}>
                <Text style={styles.roleText}>{u.role}</Text>
              </View>
              {u.role === "user" && (
                <View style={{ gap: 4 }}>
                  <Pressable style={styles.promoteBtn} onPress={() => setRole(u, "advertiser")} testID={`promote-adv-${u.id}`}>
                    <Text style={styles.promoteText}>Advertiser</Text>
                  </Pressable>
                  <Pressable style={[styles.promoteBtn, { backgroundColor: colors.success }]} onPress={() => setRole(u, "partner")} testID={`promote-partner-${u.id}`}>
                    <Text style={styles.promoteText}>Partner</Text>
                  </Pressable>
                </View>
              )}
              {(u.role === "advertiser" || u.role === "partner") && (
                <Pressable style={[styles.promoteBtn, styles.demoteBtn]} onPress={() => setRole(u, "user")} testID={`demote-${u.id}`}>
                  <Text style={[styles.promoteText, { color: colors.error }]}>Revoke</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Campaign approvals ({campaigns.filter((c) => c.status === "pending").length} pending)</Text>
          {campaigns.length === 0 && <Text style={styles.emptyText}>No campaigns submitted yet.</Text>}
          {campaigns.map((c) => (
            <View key={c.id} style={styles.campRow} testID={`admin-camp-${c.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userAlias} numberOfLines={1}>{c.title}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>
                  {c.partner?.business_name ?? c.partner?.alias ?? "?"} · {c.reward_type}
                  {(c.reward_type === "points" || c.reward_type === "both") && ` · +${c.points_amount}pts`}
                  {(c.reward_type === "discount" || c.reward_type === "both") && ` · ${c.discount_label}`}
                </Text>
                <Text style={styles.userEmail} numberOfLines={2}>{c.description}</Text>
                {c.status === "rejected" && !!c.rejected_reason && (
                  <Text style={[styles.userEmail, { color: colors.error }]}>Rejected: {c.rejected_reason}</Text>
                )}
              </View>
              {c.status === "pending" ? (
                <View style={{ gap: 4 }}>
                  <Pressable style={[styles.promoteBtn, { backgroundColor: colors.success }]} onPress={() => approveCampaign(c)} testID={`approve-${c.id}`}>
                    <Text style={styles.promoteText}>Approve</Text>
                  </Pressable>
                  <Pressable style={[styles.promoteBtn, { backgroundColor: colors.error }]} onPress={() => rejectCampaign(c)} testID={`reject-${c.id}`}>
                    <Text style={styles.promoteText}>Reject</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={[styles.roleChip, c.status === "approved" && styles.roleChipAdv, c.status === "rejected" && { backgroundColor: "#FDE0E0" }]}>
                  <Text style={styles.roleText}>{c.status}</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All ads ({ads.length})</Text>
          {ads.length === 0 && <Text style={styles.emptyText}>No ads created yet.</Text>}
          {ads.map((a) => (
            <View key={a.id} style={styles.adRow} testID={`admin-ad-${a.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userAlias} numberOfLines={1}>{a.business_name}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>
                  {a.advertiser?.email ?? "?"} · {a.stats.impressions} views · {a.stats.clicks} clicks · {a.stats.ctr}% CTR
                </Text>
              </View>
              <Switch
                value={a.enabled}
                onValueChange={(v) => toggleAd(a, v)}
                trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                testID={`admin-ad-toggle-${a.id}`}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal transparent visible={!!promotePartner} animationType="fade" onRequestClose={() => setPromotePartner(null)}>
        <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Promote to Partner</Text>
            <Text style={{ color: colors.muted, fontSize: font.sm }}>Add the business details for this partner:</Text>
            <TextInput
              value={promotePartner?.businessName ?? ""}
              onChangeText={(v) => setPromotePartner((p) => (p ? { ...p, businessName: v } : p))}
              placeholder="Business name (e.g. Huni Cafe)"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="partner-business-name"
            />
            <TextInput
              value={promotePartner?.businessType ?? ""}
              onChangeText={(v) => setPromotePartner((p) => (p ? { ...p, businessType: v } : p))}
              placeholder="Type (cafe, restaurant, event, ...)"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="partner-business-type"
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable style={[styles.promoteBtn, styles.demoteBtn, { flex: 1, paddingVertical: 12, alignItems: "center" }]} onPress={() => setPromotePartner(null)}>
                <Text style={styles.promoteText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.promoteBtn, { flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: colors.success }]} onPress={confirmPartnerPromotion} testID="confirm-partner">
                <Text style={styles.promoteText}>Promote</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  section: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: font.base, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: font.sm, color: colors.muted },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  weightValue: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface, minWidth: 28, textAlign: "center" },
  searchRow: { flexDirection: "row", gap: spacing.sm },
  input: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: font.base, color: colors.onSurface, borderWidth: 1, borderColor: colors.border,
  },
  searchBtn: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  userAlias: { fontWeight: "700", color: colors.onSurface, fontSize: font.sm + 1 },
  userEmail: { color: colors.muted, fontSize: font.sm },
  roleChip: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary,
  },
  roleChipAdmin: { backgroundColor: "#FBE3C9" },
  roleChipAdv: { backgroundColor: colors.brandTertiary },
  roleChipPartner: { backgroundColor: "#DDF3E2" },
  roleText: { fontSize: 10, fontWeight: "800", color: colors.onSurface, textTransform: "uppercase" },
  promoteBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brand,
  },
  demoteBtn: { backgroundColor: colors.surfaceTertiary },
  promoteText: { color: "#FFF", fontWeight: "700", fontSize: 11 },
  adRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  campRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: 8, alignItems: "flex-start", borderTopWidth: 1, borderTopColor: colors.divider },
  emptyText: { color: colors.muted, fontSize: font.sm },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontWeight: "800", fontSize: font.lg, color: colors.onSurface },
});
