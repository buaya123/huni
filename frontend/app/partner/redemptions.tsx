import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type PartnerRedemption = {
  id: string;
  campaign_title: string;
  user_alias: string;
  points_awarded: number;
  discount_applied: string;
  redeemed_at: string;
};

export default function PartnerRedemptions() {
  const router = useRouter();
  const [rows, setRows] = useState<PartnerRedemption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setRows(await api.get<PartnerRedemption[]>("/partner/redemptions")); }
    catch { setRows([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Redemption log</Text>
        <View style={{ width: 26 }} />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : rows.length === 0 ? (
        <EmptyState title="No redemptions yet" subtitle="When you scan a user QR and apply a campaign, it'll appear here." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }}>
          {rows.map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={styles.icon}><Ionicons name="gift" size={20} color={colors.onBrandTertiary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rTitle} numberOfLines={1}>{r.campaign_title}</Text>
                <Text style={styles.rSub} numberOfLines={1}>{r.user_alias}</Text>
                <Text style={styles.rDate}>{new Date(r.redeemed_at).toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {r.points_awarded > 0 && <Text style={styles.pts}>+{r.points_awarded}pts</Text>}
                {!!r.discount_applied && <Text style={styles.disc}>{r.discount_applied}</Text>}
              </View>
            </View>
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
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rTitle: { fontWeight: "800", color: colors.onSurface },
  rSub: { color: colors.muted, fontSize: font.sm },
  rDate: { color: colors.muted, fontSize: 11, marginTop: 2 },
  pts: { color: colors.success, fontWeight: "900" },
  disc: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: font.sm },
});
