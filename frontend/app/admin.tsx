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

function rewardSummary(c: { exp_per_redemption?: number; tokens_per_redemption?: number; discount_label?: string }): string {
  const parts: string[] = [];
  if ((c.exp_per_redemption ?? 0) > 0) parts.push(`+${c.exp_per_redemption} EXP`);
  if ((c.tokens_per_redemption ?? 0) > 0) parts.push(`+${c.tokens_per_redemption} tokens`);
  if (c.discount_label) parts.push(c.discount_label);
  return parts.length > 0 ? parts.join(" · ") : "Not set (pending approval)";
}

function ReviewField({ label, value, error }: { label: string; value: string; error?: boolean }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, error && { color: colors.error }]}>{value}</Text>
    </View>
  );
}

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
  // Legacy (still in API for backwards compat but unused)
  reward_type?: string;
  points_amount?: number;
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
  const [reviewCampaign, setReviewCampaign] = useState<AdminCampaign | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approving, setApproving] = useState<AdminCampaign | null>(null);
  const [approvalExpPer, setApprovalExpPer] = useState<string>("25");
  const [approvalTokPer, setApprovalTokPer] = useState<string>("50");
  const [approvalExpBudget, setApprovalExpBudget] = useState<string>("2500");
  const [approvalTokBudget, setApprovalTokBudget] = useState<string>("5000");
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

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

  const openApproveFlow = (c: AdminCampaign) => {
    setApprovalExpPer("25");
    setApprovalTokPer("50");
    setApprovalExpBudget("2500");
    setApprovalTokBudget("5000");
    setApproving(c);
  };

  const submitApproval = async () => {
    if (!approving) return;
    const expPer = parseInt(approvalExpPer || "0", 10) || 0;
    const tokPer = parseInt(approvalTokPer || "0", 10) || 0;
    const expBudget = parseInt(approvalExpBudget || "0", 10) || 0;
    const tokBudget = parseInt(approvalTokBudget || "0", 10) || 0;
    if (expPer > 0 && expBudget < expPer) { Alert.alert("Invalid", "EXP budget must be at least the per-person EXP amount."); return; }
    if (tokPer > 0 && tokBudget < tokPer) { Alert.alert("Invalid", "Token budget must be at least the per-person token amount."); return; }
    setApprovalSubmitting(true);
    try {
      await api.post(`/admin/campaigns/${approving.id}/approve`, {
        exp_per_redemption: expPer,
        tokens_per_redemption: tokPer,
        budget_exp: expBudget,
        budget_tokens: tokBudget,
      });
      setCampaigns((prev) => prev.map((x) => (x.id === approving.id ? {
        ...x,
        status: "approved",
        state: "live",
        exp_per_redemption: expPer,
        tokens_per_redemption: tokPer,
        budget_exp: expBudget,
        budget_tokens: tokBudget,
        remaining_exp: expBudget,
        remaining_tokens: tokBudget,
      } : x)));
      setApproving(null);
      setReviewCampaign(null);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not approve");
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const submitReject = async () => {
    if (!rejectingId) return;
    try {
      await api.post(`/admin/campaigns/${rejectingId}/reject`, { reason: rejectReason.trim() });
      setCampaigns((prev) => prev.map((x) => (x.id === rejectingId ? { ...x, status: "rejected", state: "rejected", rejected_reason: rejectReason.trim() } : x)));
      setReviewCampaign((r) => (r && r.id === rejectingId ? { ...r, status: "rejected", state: "rejected", rejected_reason: rejectReason.trim() } : r));
      setRejectingId(null);
      setRejectReason("");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not reject");
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
            <Pressable
              key={c.id}
              style={styles.campRow}
              onPress={() => setReviewCampaign(c)}
              testID={`admin-camp-${c.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.userAlias} numberOfLines={2}>{c.title}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>
                  {c.partner?.business_name ?? c.partner?.alias ?? "?"} · {rewardSummary(c)}
                </Text>
                <Text style={styles.userEmail} numberOfLines={2}>{c.description}</Text>
                {c.status === "rejected" && !!c.rejected_reason && (
                  <Text style={[styles.userEmail, { color: colors.error }]} numberOfLines={2}>Rejected: {c.rejected_reason}</Text>
                )}
                <View style={styles.reviewCTA}>
                  <Ionicons name="eye-outline" size={12} color={colors.brand} />
                  <Text style={styles.reviewCTAText}>Tap to review full details</Text>
                </View>
              </View>
              {c.status === "pending" ? (
                <View style={{ gap: 4 }}>
                  <Pressable style={[styles.promoteBtn, { backgroundColor: colors.success }]} onPress={() => openApproveFlow(c)} testID={`approve-${c.id}`}>
                    <Text style={styles.promoteText}>Approve</Text>
                  </Pressable>
                  <Pressable style={[styles.promoteBtn, { backgroundColor: colors.error }]} onPress={() => { setRejectingId(c.id); setRejectReason(""); }} testID={`reject-${c.id}`}>
                    <Text style={styles.promoteText}>Reject</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={[styles.roleChip, c.status === "approved" && styles.roleChipAdv, c.status === "rejected" && { backgroundColor: "#FDE0E0" }]}>
                  <Text style={styles.roleText}>{c.status}</Text>
                </View>
              )}
            </Pressable>
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

      {/* Campaign review modal - full details, scrollable */}
      <Modal transparent visible={!!reviewCampaign} animationType="fade" onRequestClose={() => setReviewCampaign(null)}>
        <View style={styles.modalBg}>
          <View style={styles.reviewCard}>
            <View style={styles.reviewHead}>
              <Text style={styles.modalTitle} numberOfLines={2}>{reviewCampaign?.title}</Text>
              <Pressable onPress={() => setReviewCampaign(null)} hitSlop={12} testID="close-review">
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
              {reviewCampaign && (
                <>
                  <View style={styles.reviewPartnerRow}>
                    <View style={styles.reviewAvatar}>
                      <Ionicons name="business" size={18} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewPartnerName} numberOfLines={1}>
                        {reviewCampaign.partner?.business_name || reviewCampaign.partner?.alias || "Partner"}
                      </Text>
                      <Text style={styles.reviewPartnerSub} numberOfLines={1}>
                        {reviewCampaign.partner?.business_type || "Local business"}
                      </Text>
                    </View>
                    <View style={[styles.roleChip, reviewCampaign.status === "approved" && styles.roleChipAdv, reviewCampaign.status === "rejected" && { backgroundColor: "#FDE0E0" }]}>
                      <Text style={styles.roleText}>{reviewCampaign.status}</Text>
                    </View>
                  </View>

                  <ReviewField label="Description" value={reviewCampaign.description} />
                  {!!reviewCampaign.discount_label && (
                    <ReviewField label="In-store discount" value={reviewCampaign.discount_label} />
                  )}
                  {!!reviewCampaign.terms && <ReviewField label="Terms" value={reviewCampaign.terms} />}
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <View style={{ flex: 1 }}><ReviewField label="Start" value={reviewCampaign.start_date || "—"} /></View>
                    <View style={{ flex: 1 }}><ReviewField label="End" value={reviewCampaign.end_date || "—"} /></View>
                  </View>
                  {reviewCampaign.status === "approved" && (
                    <View style={styles.reviewBudget}>
                      <Text style={styles.fieldLabel}>Reward allocation</Text>
                      <View style={styles.rewardStatsRow}>
                        <View style={styles.rewardStat}>
                          <Text style={styles.rewardStatValue}>+{reviewCampaign.exp_per_redemption} EXP</Text>
                          <Text style={styles.rewardStatLabel}>per person</Text>
                        </View>
                        <View style={styles.rewardStat}>
                          <Text style={styles.rewardStatValue}>+{reviewCampaign.tokens_per_redemption} tk</Text>
                          <Text style={styles.rewardStatLabel}>per person</Text>
                        </View>
                        <View style={styles.rewardStat}>
                          <Text style={styles.rewardStatValue}>{reviewCampaign.remaining_exp}/{reviewCampaign.budget_exp}</Text>
                          <Text style={styles.rewardStatLabel}>EXP left</Text>
                        </View>
                        <View style={styles.rewardStat}>
                          <Text style={styles.rewardStatValue}>{reviewCampaign.remaining_tokens}/{reviewCampaign.budget_tokens}</Text>
                          <Text style={styles.rewardStatLabel}>tokens left</Text>
                        </View>
                      </View>
                    </View>
                  )}
                  <ReviewField label="Redemptions so far" value={String(reviewCampaign.redemption_count)} />
                  {reviewCampaign.status === "rejected" && !!reviewCampaign.rejected_reason && (
                    <ReviewField label="Previous rejection reason" value={reviewCampaign.rejected_reason} error />
                  )}
                </>
              )}
            </ScrollView>
            {reviewCampaign?.status === "pending" ? (
              <View style={styles.reviewActions}>
                <Pressable style={[styles.promoteBtn, styles.demoteBtn, { flex: 1, paddingVertical: 12, alignItems: "center" }]} onPress={() => { const c = reviewCampaign; setReviewCampaign(null); setRejectingId(c.id); setRejectReason(""); }} testID="review-reject">
                  <Text style={[styles.promoteText, { color: colors.error }]}>Reject</Text>
                </Pressable>
                <Pressable style={[styles.promoteBtn, { flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: colors.success }]} onPress={() => reviewCampaign && openApproveFlow(reviewCampaign)} testID="review-approve">
                  <Text style={styles.promoteText}>Approve</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={[styles.promoteBtn, { paddingVertical: 12, alignItems: "center", backgroundColor: colors.surfaceTertiary }]} onPress={() => setReviewCampaign(null)}>
                <Text style={[styles.promoteText, { color: colors.onSurface }]}>Close</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* Approval-with-budget modal */}
      <Modal transparent visible={!!approving} animationType="slide" onRequestClose={() => setApproving(null)}>
        <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.approveCard}>
            <View style={styles.reviewHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Approve & allocate</Text>
                <Text style={{ color: colors.muted, fontSize: font.sm }} numberOfLines={1}>{approving?.title}</Text>
              </View>
              <Pressable onPress={() => setApproving(null)} hitSlop={12}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }} keyboardShouldPersistTaps="handled">
              <Text style={{ color: colors.muted, fontSize: font.sm }}>
                Set the per-person EXP & Token allocation and the total budget for this campaign package.
              </Text>
              <View style={styles.allocSection}>
                <Text style={styles.allocSectionTitle}>EXP allocation</Text>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Per person</Text>
                    <TextInput style={styles.input} value={approvalExpPer} onChangeText={(v) => setApprovalExpPer(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="25" placeholderTextColor={colors.muted} testID="approve-exp-per" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Total EXP budget</Text>
                    <TextInput style={styles.input} value={approvalExpBudget} onChangeText={(v) => setApprovalExpBudget(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="2500" placeholderTextColor={colors.muted} testID="approve-exp-budget" />
                  </View>
                </View>
              </View>
              <View style={styles.allocSection}>
                <Text style={styles.allocSectionTitle}>Token allocation</Text>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Per person</Text>
                    <TextInput style={styles.input} value={approvalTokPer} onChangeText={(v) => setApprovalTokPer(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="50" placeholderTextColor={colors.muted} testID="approve-tok-per" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Total token budget</Text>
                    <TextInput style={styles.input} value={approvalTokBudget} onChangeText={(v) => setApprovalTokBudget(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="5000" placeholderTextColor={colors.muted} testID="approve-tok-budget" />
                  </View>
                </View>
              </View>
              <View style={styles.calcRow}>
                <Ionicons name="calculator-outline" size={14} color={colors.muted} />
                <Text style={styles.calcText}>
                  Fits ~{Math.min(
                    parseInt(approvalExpPer || "0", 10) > 0 ? Math.floor((parseInt(approvalExpBudget || "0", 10) || 0) / Math.max(1, parseInt(approvalExpPer || "0", 10))) : 999999,
                    parseInt(approvalTokPer || "0", 10) > 0 ? Math.floor((parseInt(approvalTokBudget || "0", 10) || 0) / Math.max(1, parseInt(approvalTokPer || "0", 10))) : 999999,
                  ).toLocaleString()} redemptions
                </Text>
              </View>
            </ScrollView>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable style={[styles.promoteBtn, styles.demoteBtn, { flex: 1, paddingVertical: 12, alignItems: "center" }]} onPress={() => setApproving(null)}>
                <Text style={styles.promoteText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.promoteBtn, { flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: colors.success }]} onPress={submitApproval} disabled={approvalSubmitting} testID="submit-approval">
                {approvalSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.promoteText}>Approve & go live</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reject reason modal (cross-platform, replaces Alert.prompt) */}
      <Modal transparent visible={!!rejectingId} animationType="fade" onRequestClose={() => setRejectingId(null)}>
        <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject campaign</Text>
            <Text style={{ color: colors.muted, fontSize: font.sm }}>Tell the partner why (visible to them):</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. Offer wording is unclear"
              placeholderTextColor={colors.muted}
              style={[styles.input, { minHeight: 70 }]}
              multiline
              maxLength={300}
              testID="reject-reason-input"
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable style={[styles.promoteBtn, styles.demoteBtn, { flex: 1, paddingVertical: 12, alignItems: "center" }]} onPress={() => setRejectingId(null)}>
                <Text style={styles.promoteText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.promoteBtn, { flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: colors.error }]} onPress={submitReject} testID="confirm-reject">
                <Text style={styles.promoteText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  reviewCard: { width: "100%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, maxHeight: "88%" },
  reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  reviewPartnerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  reviewPartnerName: { fontWeight: "800", color: colors.onSurface },
  reviewPartnerSub: { color: colors.muted, fontSize: font.sm, textTransform: "capitalize" },
  reviewActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  fieldLabel: { fontWeight: "800", color: colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  fieldValue: { color: colors.onSurface, fontSize: font.base, lineHeight: 20 },
  reviewCTA: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  reviewCTAText: { color: colors.brand, fontSize: 11, fontWeight: "700" },
  approveCard: { width: "100%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, maxHeight: "92%" },
  allocSection: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  allocSectionTitle: { fontWeight: "900", color: colors.onSurface },
  calcRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  calcText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: font.sm },
  reviewBudget: { gap: 4 },
  rewardStatsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rewardStat: { flex: 1, minWidth: 80, backgroundColor: colors.brandTertiary, padding: spacing.sm, borderRadius: radius.sm, alignItems: "center" },
  rewardStatValue: { fontWeight: "900", color: colors.onBrandTertiary, fontSize: font.sm },
  rewardStatLabel: { color: colors.onBrandTertiary, opacity: 0.75, fontSize: 10 },
});
