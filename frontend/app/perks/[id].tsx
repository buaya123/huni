import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, imageUrl } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import type { Campaign } from "./index";

export default function PerkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setC(await api.get<Campaign>(`/campaigns/${id}`)); } catch { setC(null); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading) return <SafeAreaView style={styles.wrap}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  if (!c) return <SafeAreaView style={styles.wrap}><View style={styles.center}><Text style={styles.hint}>Perk not found.</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title} numberOfLines={1}>{c.title}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {c.images[0] && <Image source={{ uri: imageUrl(c.images[0]) }} style={styles.hero} />}
        <View style={styles.body}>
          <Text style={styles.business}>{c.partner?.business_name || c.partner?.alias || "Partner"}</Text>
          <Text style={styles.name}>{c.title}</Text>
          <View style={styles.rewardCard}>
            <Ionicons name="gift" size={20} color={colors.onBrandTertiary} />
            <View style={{ flex: 1 }}>
              {(c.reward_type === "points" || c.reward_type === "both") && (
                <Text style={styles.rewardLine}>Earn <Text style={{ fontWeight: "900" }}>+{c.points_amount} Huni points</Text></Text>
              )}
              {(c.reward_type === "discount" || c.reward_type === "both") && (
                <Text style={styles.rewardLine}><Text style={{ fontWeight: "900" }}>{c.discount_label}</Text></Text>
              )}
            </View>
          </View>
          <Text style={styles.desc}>{c.description}</Text>
          {!!c.terms && (
            <View style={styles.terms}>
              <Text style={styles.termsTitle}>Fine print</Text>
              <Text style={styles.termsText}>{c.terms}</Text>
            </View>
          )}
          <View style={styles.howto}>
            <Text style={styles.howtoTitle}>How to redeem</Text>
            <Text style={styles.howtoStep}>1. Go to the partner in person.</Text>
            <Text style={styles.howtoStep}>2. Open your Profile → tap the QR icon.</Text>
            <Text style={styles.howtoStep}>3. Let the partner scan your code — done!</Text>
          </View>
          {c.already_redeemed && (
            <View style={styles.claimed}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.claimedText}>You&apos;ve already claimed this perk.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, flex: 1, textAlign: "center", marginHorizontal: spacing.sm },
  hint: { color: colors.muted },
  hero: { width: "100%", height: 200, backgroundColor: colors.surfaceTertiary },
  body: { padding: spacing.lg, gap: spacing.md },
  business: { color: colors.brand, fontWeight: "800" },
  name: { fontSize: 22, fontWeight: "900", color: colors.onSurface },
  rewardCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md,
  },
  rewardLine: { color: colors.onBrandTertiary, fontSize: font.base },
  desc: { color: colors.onSurface, lineHeight: 22 },
  terms: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  termsTitle: { fontWeight: "800", color: colors.onSurface, marginBottom: 4 },
  termsText: { color: colors.onSurfaceTertiary, fontSize: font.sm, lineHeight: 18 },
  howto: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  howtoTitle: { fontWeight: "800", color: colors.onSurface },
  howtoStep: { color: colors.onSurfaceTertiary, fontSize: font.sm },
  claimed: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.md },
  claimedText: { color: colors.success, fontWeight: "700" },
});
