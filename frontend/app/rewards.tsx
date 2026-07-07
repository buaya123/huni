import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type Redemption = {
  id: string;
  campaign_title: string;
  partner_business_name: string;
  points_awarded: number;
  discount_applied: string;
  redeemed_at: string;
};

export default function Rewards() {
  const router = useRouter();
  const [points, setPoints] = useState<number>(0);
  const [items, setItems] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [pts, rs] = await Promise.all([
        api.get<{ points: number; redemptions: number }>("/me/points"),
        api.get<Redemption[]>("/me/redemptions"),
      ]);
      setPoints(pts.points);
      setItems(rs);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>My Rewards</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <View style={styles.pointsCard}>
          <Text style={styles.pointsLabel}>Huni points</Text>
          <Text style={styles.pointsBig}>{points}</Text>
          <Text style={styles.pointsSub}>{items.length} redemption{items.length === 1 ? "" : "s"} so far</Text>
        </View>

        <Text style={styles.sectionTitle}>History</Text>
        {loading ? (
          <View style={{ alignItems: "center", padding: spacing.xl }}><ActivityIndicator color={colors.brand} /></View>
        ) : items.length === 0 ? (
          <EmptyState title="No redemptions yet" subtitle="Scan your QR at any Huni partner to start earning." />
        ) : (
          items.map((r) => (
            <View key={r.id} style={styles.row} testID={`redemption-${r.id}`}>
              <View style={styles.rowIcon}><Ionicons name="gift" size={20} color={colors.onBrandTertiary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{r.campaign_title}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{r.partner_business_name}</Text>
                <Text style={styles.rowDate}>{new Date(r.redeemed_at).toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {r.points_awarded > 0 && <Text style={styles.rowPoints}>+{r.points_awarded} pts</Text>}
                {!!r.discount_applied && <Text style={styles.rowDiscount}>{r.discount_applied}</Text>}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  pointsCard: {
    backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.lg, alignItems: "center",
  },
  pointsLabel: { color: "#FFE", fontWeight: "600", fontSize: font.sm },
  pointsBig: { color: "#FFFFFF", fontSize: 44, fontWeight: "900", marginTop: 4 },
  pointsSub: { color: "#FFE", opacity: 0.9, marginTop: 2 },
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
  rowDiscount: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: font.sm },
});
