import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type Analytics = {
  ad: {
    id: string;
    business_name: string;
    title: string;
    enabled: boolean;
    comments_enabled: boolean;
    frequency_weight: number;
  };
  totals: { impressions: number; clicks: number; unique_viewers: number; ctr: number };
  daily: { date: string; impressions: number; clicks: number }[];
  recent_clicks: string[];
};

export default function AdAnalytics() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<Analytics>(`/ads/${id}/analytics`);
      setData(d);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api.patch(`/ads/${id}`, body);
      setData((prev) => (prev ? { ...prev, ad: { ...prev.ad, ...body } } : prev));
    } catch { /* ignore */ }
  };

  const doDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.del(`/ads/${id}`);
      router.replace("/ads");
    } catch { /* ignore */ }
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.wrap} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  const { ad, totals, daily, recent_clicks } = data;
  const maxDay = Math.max(1, ...daily.map((d) => d.impressions));

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/ads"))} hitSlop={12} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{ad.business_name}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <Text style={styles.adTitle}>{ad.title}</Text>

        <View style={styles.totalsGrid} testID="ad-totals">
          <TotalCard label="Views" value={totals.impressions} icon="eye-outline" />
          <TotalCard label="Unique viewers" value={totals.unique_viewers} icon="people-outline" />
          <TotalCard label="Clicks" value={totals.clicks} icon="hand-left-outline" />
          <TotalCard label="CTR" value={`${totals.ctr}%`} icon="trending-up-outline" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last 14 days</Text>
          <View style={styles.chart} testID="ad-daily-chart">
            {daily.map((d) => (
              <View key={d.date} style={styles.chartCol}>
                <View style={styles.barArea}>
                  <View
                    style={[styles.barImp, { height: Math.max(2, (d.impressions / maxDay) * 96) }]}
                  />
                  <View
                    style={[styles.barClk, { height: Math.max(d.clicks > 0 ? 2 : 0, (d.clicks / maxDay) * 96) }]}
                  />
                </View>
                <Text style={styles.chartDay}>{d.date.slice(8)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
            <Text style={styles.legendText}>Views</Text>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Clicks</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ad settings</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Ad active</Text>
            <Switch
              value={ad.enabled}
              onValueChange={(v) => patch({ enabled: v })}
              trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
              testID="setting-enabled"
            />
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Allow comments</Text>
            <Switch
              value={ad.comments_enabled}
              onValueChange={(v) => patch({ comments_enabled: v })}
              trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
              testID="setting-comments"
            />
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Frequency weight</Text>
            <View style={styles.stepperRow}>
              <Pressable
                style={styles.stepBtn}
                onPress={() => patch({ frequency_weight: Math.max(1, ad.frequency_weight - 1) })}
                testID="setting-weight-minus"
              >
                <Ionicons name="remove" size={18} color={colors.onSurface} />
              </Pressable>
              <Text style={styles.weightValue} testID="setting-weight-value">{ad.frequency_weight}</Text>
              <Pressable
                style={styles.stepBtn}
                onPress={() => patch({ frequency_weight: Math.min(10, ad.frequency_weight + 1) })}
                testID="setting-weight-plus"
              >
                <Ionicons name="add" size={18} color={colors.onSurface} />
              </Pressable>
            </View>
          </View>
          <Pressable style={styles.viewAdBtn} onPress={() => router.push(`/ad/${id}`)} testID="view-ad-btn">
            <Ionicons name="eye-outline" size={16} color={colors.brand} />
            <Text style={styles.viewAdText}>View ad & moderate comments</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent clicks</Text>
          {recent_clicks.length === 0 ? (
            <Text style={styles.emptyText}>No clicks yet.</Text>
          ) : (
            recent_clicks.slice(0, 10).map((ts, i) => (
              <View key={`${ts}-${i}`} style={styles.clickRow}>
                <Ionicons name="time-outline" size={14} color={colors.muted} />
                <Text style={styles.clickText}>{new Date(ts).toLocaleString()}</Text>
              </View>
            ))
          )}
        </View>

        <Pressable style={styles.deleteBtn} onPress={doDelete} testID="delete-ad-btn">
          <Ionicons name="trash-outline" size={18} color={colors.error} />
          <Text style={styles.deleteText}>{confirmDelete ? "Tap again to confirm delete" : "Delete ad"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function TotalCard({ label, value, icon }: { label: string; value: number | string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.totalCard}>
      <Ionicons name={icon} size={18} color={colors.brand} />
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, flex: 1, textAlign: "center" },
  adTitle: { fontSize: font.base, color: colors.onSurfaceTertiary },
  totalsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  totalCard: {
    flexBasis: "47%", flexGrow: 1,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, gap: 4, borderWidth: 1, borderColor: colors.border,
  },
  totalValue: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  totalLabel: { fontSize: font.sm, color: colors.muted },
  section: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: font.base, fontWeight: "700", color: colors.onSurface },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 3 },
  chartCol: { flex: 1, alignItems: "center", gap: 2 },
  barArea: { flexDirection: "row", alignItems: "flex-end", gap: 1, height: 96 },
  barImp: { width: 7, borderRadius: 2, backgroundColor: colors.brand },
  barClk: { width: 5, borderRadius: 2, backgroundColor: colors.success },
  chartDay: { fontSize: 8, color: colors.muted },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: font.sm, color: colors.muted, marginRight: spacing.sm },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  settingLabel: { fontSize: font.base, color: colors.onSurface },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  weightValue: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface, minWidth: 24, textAlign: "center" },
  viewAdBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: spacing.sm },
  viewAdText: { color: colors.brand, fontWeight: "700", fontSize: font.sm },
  clickRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  clickText: { color: colors.onSurfaceTertiary, fontSize: font.sm },
  emptyText: { color: colors.muted, fontSize: font.sm },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
  },
  deleteText: { color: colors.error, fontWeight: "700" },
});
