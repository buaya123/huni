import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import { rankForExp, type Rank } from "@/src/utils/rank";

type Redemption = {
  id: string;
  campaign_title: string;
  partner_business_name: string;
  exp_awarded?: number;
  tokens_awarded?: number;
  points_awarded?: number;  // legacy
  discount_applied: string;
  redeemed_at: string;
};

type EconomyResp = {
  exp: number;
  tokens: number;
  redemptions: number;
  rank: Rank;
};

export default function Rewards() {
  const router = useRouter();
  const [econ, setEcon] = useState<EconomyResp | null>(null);
  const [items, setItems] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [e, rs] = await Promise.all([
        api.get<EconomyResp>("/me/economy"),
        api.get<Redemption[]>("/me/redemptions"),
      ]);
      setEcon(e);
      setItems(rs);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rank = econ?.rank ?? rankForExp(0);

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>My Rewards</Text>
        <Pressable onPress={() => router.push("/huni-guide")} hitSlop={12} testID="info-btn">
          <Ionicons name="information-circle-outline" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        {/* Rank + EXP card */}
        <View style={styles.rankCard}>
          <View style={styles.rankHeader}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>Lv. {rank.level}</Text>
            </View>
            <Text style={styles.titleText}>{rank.title}</Text>
          </View>
          <Text style={styles.expBig}>{rank.exp.toLocaleString()} EXP</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${rank.progress_percent}%` }]} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>{rank.exp_current_level.toLocaleString()}</Text>
            <Text style={styles.progressLabel}>
              {rank.level < 100 ? `${(rank.exp_next_level - rank.exp).toLocaleString()} to Lv. ${rank.level + 1}` : "Max level"}
            </Text>
            <Text style={styles.progressLabel}>{rank.exp_next_level.toLocaleString()}</Text>
          </View>
        </View>

        {/* Tokens card */}
        <View style={styles.tokensCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.tokensLabel}>Huni Tokens</Text>
            <Text style={styles.tokensBig}>{(econ?.tokens ?? 0).toLocaleString()}</Text>
            <Text style={styles.tokensSub}>Spendable on cosmetics, raffles & events</Text>
          </View>
          <Pressable style={styles.spendBtn} onPress={() => router.push("/store")} testID="open-store">
            <Ionicons name="storefront-outline" size={16} color="#FFFFFF" />
            <Text style={styles.spendBtnText}>Store</Text>
          </Pressable>
        </View>

        {/* Info cards */}
        <View style={styles.infoRow}>
          <Pressable style={styles.infoCard} onPress={() => router.push("/huni-guide")}>
            <Ionicons name="help-circle-outline" size={22} color={colors.brand} />
            <Text style={styles.infoTitle}>How does this work?</Text>
            <Text style={styles.infoSub}>Learn about EXP, Tokens & Levels</Text>
          </Pressable>
          <Pressable style={styles.infoCard} onPress={() => router.push("/perks")}>
            <Ionicons name="pricetags-outline" size={22} color={colors.brand} />
            <Text style={styles.infoTitle}>Earn from perks</Text>
            <Text style={styles.infoSub}>Browse local partner rewards</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Redemption history</Text>
        {loading ? (
          <View style={{ alignItems: "center", padding: spacing.xl }}><ActivityIndicator color={colors.brand} /></View>
        ) : items.length === 0 ? (
          <EmptyState title="No redemptions yet" subtitle="Scan your QR at any Huni partner to start earning." />
        ) : (
          items.map((r) => {
            const exp = r.exp_awarded ?? r.points_awarded ?? 0;
            const tok = r.tokens_awarded ?? 0;
            return (
              <View key={r.id} style={styles.row} testID={`redemption-${r.id}`}>
                <View style={styles.rowIcon}><Ionicons name="gift" size={20} color={colors.onBrandTertiary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{r.campaign_title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{r.partner_business_name}</Text>
                  <Text style={styles.rowDate}>{new Date(r.redeemed_at).toLocaleString()}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  {exp > 0 && <Text style={styles.rowPoints}>+{exp} EXP</Text>}
                  {tok > 0 && <Text style={styles.rowTokens}>+{tok} tokens</Text>}
                  {!!r.discount_applied && <Text style={styles.rowDiscount}>{r.discount_applied}</Text>}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  rankCard: {
    backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm,
  },
  rankHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  levelBadge: { backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  levelBadgeText: { color: "#FFFFFF", fontWeight: "900", fontSize: font.sm },
  titleText: { color: "#FFFFFF", fontWeight: "800", fontSize: font.lg, flex: 1 },
  expBig: { color: "#FFFFFF", fontSize: 38, fontWeight: "900", marginTop: 4 },
  progressBar: { height: 8, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#FFFFFF", borderRadius: 4 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  progressLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600" },
  tokensCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  tokensLabel: { color: colors.muted, fontWeight: "600", fontSize: font.sm },
  tokensBig: { color: colors.onSurface, fontSize: 30, fontWeight: "900" },
  tokensSub: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  spendBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill,
  },
  spendBtnText: { color: "#FFFFFF", fontWeight: "800" },
  infoRow: { flexDirection: "row", gap: spacing.md },
  infoCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  infoTitle: { fontWeight: "800", color: colors.onSurface, fontSize: font.sm },
  infoSub: { color: colors.muted, fontSize: 11 },
  sectionTitle: { fontSize: font.base, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md },
  row: {
    flexDirection: "row", gap: spacing.sm, alignItems: "center",
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontWeight: "800", color: colors.onSurface },
  rowSub: { color: colors.muted, fontSize: font.sm },
  rowDate: { color: colors.muted, fontSize: 11, marginTop: 2 },
  rowPoints: { color: colors.success, fontWeight: "900" },
  rowTokens: { color: colors.brand, fontWeight: "800", fontSize: font.sm },
  rowDiscount: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: font.sm },
});
