import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, imageUrl } from "@/src/api/client";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

export type Campaign = {
  id: string;
  title: string;
  description: string;
  discount_label: string;
  terms: string;
  images: string[];
  start_date?: string | null;
  end_date?: string | null;
  status: string;
  state: string;
  redemption_count: number;
  // Economy (new)
  exp_per_redemption: number;
  tokens_per_redemption: number;
  budget_exp: number;
  budget_tokens: number;
  remaining_exp: number;
  remaining_tokens: number;
  enabled?: boolean;
  rejected_reason?: string | null;
  // Legacy — still present in API but unused
  reward_type?: string;
  points_amount?: number;
  partner: { id: string; alias: string; business_name: string; business_type: string } | null;
  already_redeemed?: boolean;
};

function rewardBadge(c: Campaign) {
  const parts: string[] = [];
  if (c.exp_per_redemption > 0) parts.push(`+${c.exp_per_redemption} EXP`);
  if (c.tokens_per_redemption > 0) parts.push(`+${c.tokens_per_redemption} tokens`);
  if (c.discount_label) parts.push(c.discount_label);
  return parts.length > 0 ? parts.join(" · ") : "In-store perk";
}

export default function Perks() {
  const router = useRouter();
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<Campaign[]>("/campaigns");
      setItems(rows);
    } catch { setItems([]); } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Local Perks</Text>
        <View style={{ width: 26 }} />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <EmptyState title="No perks yet" subtitle="Check back soon — partners in Buug are onboarding." />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          {items.map((c) => (
            <Pressable key={c.id} style={styles.card} onPress={() => router.push(`/perks/${c.id}` as never)} testID={`perk-${c.id}`}>
              {c.images[0] && (
                <Image source={{ uri: imageUrl(c.images[0]) }} style={styles.hero} resizeMode="cover" />
              )}
              <View style={styles.body}>
                <View style={styles.headRow}>
                  <Text style={styles.business} numberOfLines={1}>{c.partner?.business_name || c.partner?.alias || "Partner"}</Text>
                  {c.already_redeemed && (
                    <View style={styles.claimedPill}><Text style={styles.claimedText}>Claimed</Text></View>
                  )}
                </View>
                <Text style={styles.cTitle}>{c.title}</Text>
                <Text style={styles.cDesc} numberOfLines={2}>{c.description}</Text>
                <View style={styles.rewardRow}>
                  <Ionicons name="gift-outline" size={14} color={colors.brand} />
                  <Text style={styles.reward}>{rewardBadge(c)}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, overflow: "hidden",
    borderWidth: 1, borderColor: colors.border,
  },
  hero: { width: "100%", height: 130, backgroundColor: colors.surfaceTertiary },
  body: { padding: spacing.md, gap: 4 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  business: { color: colors.brand, fontWeight: "800", fontSize: font.sm, flex: 1 },
  claimedPill: { paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill },
  claimedText: { fontSize: 10, fontWeight: "800", color: colors.muted, textTransform: "uppercase" },
  cTitle: { fontSize: font.base + 2, fontWeight: "800", color: colors.onSurface },
  cDesc: { fontSize: font.sm, color: colors.onSurfaceTertiary, lineHeight: 18 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  reward: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: font.sm },
});
