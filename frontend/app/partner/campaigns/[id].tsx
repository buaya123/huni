import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import type { Campaign } from "../../perks/index";

export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setC(await api.get<Campaign>(`/partner/campaigns/${id}`)); }
    catch { setC(null); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const toggleEnabled = async (v: boolean) => {
    if (!c) return;
    setC({ ...c, enabled: v });
    try { await api.patch(`/partner/campaigns/${c.id}`, { enabled: v }); load(); }
    catch { setC({ ...c, enabled: !v }); }
  };

  const remove = () => {
    if (!c) return;
    Alert.alert("Delete campaign?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.del(`/partner/campaigns/${c.id}`); router.replace("/partner"); }
        catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Could not delete"); }
      } },
    ]);
  };

  if (loading) return <SafeAreaView style={styles.wrap}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  if (!c) return <SafeAreaView style={styles.wrap}><View style={styles.center}><Text>Campaign not found</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title} numberOfLines={1}>{c.title}</Text>
        <Pressable onPress={remove} hitSlop={12} testID="delete-campaign"><Ionicons name="trash-outline" size={22} color={colors.error} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <View style={styles.card}>
          <Text style={styles.status}>{c.state.toUpperCase()}</Text>
          {c.state === "rejected" && !!c.rejected_reason && (
            <Text style={styles.reject}>Reason: {c.rejected_reason}</Text>
          )}
          <Text style={styles.h1}>{c.title}</Text>
          <Text style={styles.body}>{c.description}</Text>

          <View style={styles.reward}>
            {(c.reward_type === "points" || c.reward_type === "both") && <Text style={styles.rewardLine}>+{c.points_amount} points per redemption</Text>}
            {(c.reward_type === "discount" || c.reward_type === "both") && <Text style={styles.rewardLine}>{c.discount_label}</Text>}
          </View>

          <View style={styles.statsRow}>
            <Stat label="Redemptions" value={String(c.redemption_count)} />
            <Stat label="Enabled" value={c.enabled ? "Yes" : "No"} />
            <Stat label="Status" value={c.status} />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Enabled</Text>
            <Switch value={c.enabled} onValueChange={toggleEnabled} trackColor={{ true: colors.brand, false: colors.surfaceTertiary }} testID="toggle-enabled" />
          </View>

          {!!c.terms && (
            <View style={styles.termsBox}>
              <Text style={styles.termsTitle}>Terms</Text>
              <Text style={styles.termsBody}>{c.terms}</Text>
            </View>
          )}
        </View>

        <Pressable style={styles.scanBtn} onPress={() => router.push("/partner/scan")} testID="go-scan">
          <Ionicons name="qr-code-outline" size={20} color="#FFFFFF" />
          <Text style={styles.scanText}>Scan a user to redeem</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, flex: 1, textAlign: "center", marginHorizontal: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  status: { color: colors.brand, fontWeight: "800", letterSpacing: 1, fontSize: 11 },
  reject: { color: colors.error, fontSize: font.sm },
  h1: { fontSize: 20, fontWeight: "900", color: colors.onSurface },
  body: { color: colors.onSurface, lineHeight: 20 },
  reward: { backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md, gap: 4 },
  rewardLine: { color: colors.onBrandTertiary, fontWeight: "800" },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.sm, alignItems: "center" },
  statValue: { fontWeight: "900", color: colors.onSurface, fontSize: font.lg },
  statLabel: { color: colors.muted, fontSize: font.sm, textTransform: "capitalize" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  toggleLabel: { color: colors.onSurface, fontWeight: "700" },
  termsBox: { backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.sm },
  termsTitle: { fontWeight: "800", color: colors.onSurface, marginBottom: 2 },
  termsBody: { color: colors.onSurfaceTertiary, fontSize: font.sm, lineHeight: 18 },
  scanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 14 },
  scanText: { color: "#FFFFFF", fontWeight: "800" },
});
