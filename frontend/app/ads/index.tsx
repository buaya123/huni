import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type AdRow = {
  id: string;
  business_name: string;
  title: string;
  enabled: boolean;
  comments_enabled: boolean;
  frequency_weight: number;
  stats: { impressions: number; clicks: number; unique_viewers: number; ctr: number };
};

export default function AdManager() {
  const router = useRouter();
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<AdRow[]>("/ads/mine");
      setAds(rows);
    } catch {
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleEnabled = async (ad: AdRow, value: boolean) => {
    setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, enabled: value } : a)));
    try {
      await api.patch(`/ads/${ad.id}`, { enabled: value });
    } catch {
      setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, enabled: !value } : a)));
    }
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))} hitSlop={12} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Ad Manager</Text>
        <Pressable onPress={() => router.push("/ads/create")} hitSlop={12} testID="new-ad-btn">
          <Ionicons name="add-circle" size={28} color={colors.brand} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          testID="my-ads-list"
          data={ads}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          ListEmptyComponent={
            <EmptyState title="No ads yet." subtitle="Tap + to create your first sponsored post." />
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/ads/${item.id}`)} testID={`my-ad-${item.id}`}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.biz} numberOfLines={1}>{item.business_name}</Text>
                  <Text style={styles.adTitle} numberOfLines={1}>{item.title}</Text>
                </View>
                <Switch
                  value={item.enabled}
                  onValueChange={(v) => toggleEnabled(item, v)}
                  trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                  testID={`ad-toggle-${item.id}`}
                />
              </View>
              <View style={styles.statsRow}>
                <Stat label="Views" value={item.stats.impressions} />
                <Stat label="Clicks" value={item.stats.clicks} />
                <Stat label="CTR" value={`${item.stats.ctr}%`} />
                <Stat label="Weight" value={item.frequency_weight} />
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  biz: { fontWeight: "800", color: colors.onSurface, fontSize: font.base },
  adTitle: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: 2 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  stat: { alignItems: "flex-start" },
  statValue: { fontWeight: "800", color: colors.onSurface, fontSize: font.base },
  statLabel: { color: colors.muted, fontSize: 11 },
});
