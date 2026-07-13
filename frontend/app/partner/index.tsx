import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, imageUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import type { Campaign } from "../perks/index";

const STATE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: "#FFF3D6", fg: "#8A6300", label: "Pending review" },
  live: { bg: "#DDF3E2", fg: "#1F6E38", label: "Live" },
  paused: { bg: "#F2EFEA", fg: "#4A4744", label: "Paused" },
  scheduled: { bg: "#E3EEFF", fg: "#1F4D9E", label: "Scheduled" },
  expired: { bg: "#F2EFEA", fg: "#8A8582", label: "Expired" },
  depleted: { bg: "#FFE1CC", fg: "#8A4B00", label: "Budget out" },
  rejected: { bg: "#FDE0E0", fg: "#8B1F1F", label: "Rejected" },
};

export default function PartnerHub() {
  const router = useRouter();
  const { user } = useAuth();
  const [scannerPartners, setScannerPartners] = useState<any[]>([]);
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isPartner = user?.role === "partner" || user?.role === "admin";

  const load = useCallback(async () => {

    try {

        setLoading(true);

        const [campaigns, partners] = await Promise.all([

            api.get<Campaign[]>("/partner/campaigns"),
            api.get<any[]>("/scanner/partners"),

        ]);

        setItems(campaigns);
        setScannerPartners(partners);

    } catch (e) {

        console.log(e);

        setItems([]);
        setScannerPartners([]);

    } finally {

        setLoading(false);
        setRefreshing(false);

    }

}, []);

  useEffect(() => { if (isPartner) load(); else setLoading(false); }, [isPartner, load]);
  useFocusEffect(useCallback(() => { if (isPartner) load(); }, [isPartner, load]));

  if (!isPartner) {
    return (
      <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
          <Text style={styles.title}>Partner Hub</Text>
          {
          scannerPartners.length > 0 && (
            <Pressable onPress={()=>router.push("/partner/select")}>
              <Text>
                Scanner
              </Text>
            </Pressable>
          )}
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="business-outline" size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>Partner access required</Text>
          <Text style={styles.emptySub}>Reach out to a Huni admin to apply as a local business partner.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const live = items.filter((c) => c.state === "live").length;
  const pending = items.filter((c) => c.status === "pending").length;

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Partner Hub</Text>
        <Pressable onPress={() => router.push("/partner/redemptions")} hitSlop={12} testID="redemption-log">
          <Ionicons name="time-outline" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <Text style={styles.business} numberOfLines={1}>{user?.business_name || user?.alias || "My Business"}</Text>
          <Text style={styles.businessSub}>{user?.business_type || "Local partner"}</Text>
        </View>

        <View style={styles.actions}>

  <Pressable
    style={[styles.actionBtn, styles.primary]}
    onPress={() => router.push("/partner/scan")}
    testID="partner-scan-btn"
  >
    <Ionicons
      name="qr-code-outline"
      size={26}
      color="#FFFFFF"
    />

    <Text style={styles.actionText}>
      Scan a user
    </Text>

  </Pressable>

  <Pressable
    style={[styles.actionBtn, styles.secondary]}
    onPress={() => router.push("/partner/campaigns/create")}
    testID="partner-new-campaign"
  >
    <Ionicons
      name="add-circle-outline"
      size={26}
      color={colors.brand}
    />

    <Text
      style={[
        styles.actionText,
        { color: colors.brand },
      ]}
    >
      New campaign
    </Text>

  </Pressable>

  <Pressable
    style={[styles.actionBtn, styles.secondary]}
    onPress={() => router.push("/partner/scanners")}
    testID="partner-scanners"
  >
    <Ionicons
      name="people-outline"
      size={26}
      color={colors.brand}
    />

    <Text
      style={[
        styles.actionText,
        { color: colors.brand },
      ]}
    >
      Scanners
    </Text>

  </Pressable>
<Pressable
  style={[styles.actionBtn, styles.secondary]}
  onPress={() => router.push("/partner/audit")}
>

  <Ionicons
    name="document-text-outline"
    size={26}
    color={colors.brand}
  />

  <Text
    style={[
      styles.actionText,
      { color: colors.brand },
    ]}
  >
    Audit Trail
  </Text>

</Pressable>
  

</View>

        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={styles.statValue}>{items.length}</Text><Text style={styles.statLabel}>Campaigns</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{live}</Text><Text style={styles.statLabel}>Live</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{pending}</Text><Text style={styles.statLabel}>Pending</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Your campaigns</Text>
        {loading ? (
          <View style={{ alignItems: "center", padding: spacing.xl }}><ActivityIndicator color={colors.brand} /></View>
        ) : items.length === 0 ? (
          <EmptyState title="No campaigns yet" subtitle="Tap 'New campaign' to draft your first offer." />
        ) : (
          items.map((c) => {
            const st = STATE_STYLES[c.state] || STATE_STYLES.pending;
            return (
              <Pressable key={c.id} style={styles.card} onPress={() => router.push(`/partner/campaigns/${c.id}` as never)} testID={`partner-campaign-${c.id}`}>
                {c.images[0] && <Image source={{ uri: imageUrl(c.images[0]) }} style={styles.thumb} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cTitle} numberOfLines={1}>{c.title}</Text>
                  <Text style={styles.cSub} numberOfLines={1}>
                    {c.exp_per_redemption > 0 && `+${c.exp_per_redemption} EXP`}
                    {c.exp_per_redemption > 0 && (c.tokens_per_redemption > 0 || c.discount_label) && " · "}
                    {c.tokens_per_redemption > 0 && `+${c.tokens_per_redemption} tokens`}
                    {c.tokens_per_redemption > 0 && c.discount_label && " · "}
                    {c.discount_label}
                    {!c.exp_per_redemption && !c.tokens_per_redemption && !c.discount_label && "Awaiting approval"}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.pill, { backgroundColor: st.bg }]}>
                      <Text style={[styles.pillText, { color: st.fg }]}>{st.label}</Text>
                    </View>
                    <Text style={styles.metaText}>· {c.redemption_count} redeemed</Text>
                  </View>
                  {c.state === "rejected" && !!c.rejected_reason && (
                    <Text style={styles.reject} numberOfLines={2}>Reason: {c.rejected_reason}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  header: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  business: { fontSize: 20, fontWeight: "900", color: colors.onSurface },
  businessSub: { color: colors.muted, fontSize: font.sm, textTransform: "capitalize" },
  actions: { flexDirection: "row", gap: spacing.md },
  actionBtn: { flex: 1, borderRadius: radius.md, padding: spacing.md, alignItems: "center", gap: 6 },
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.brandTertiary },
  actionText: { color: "#FFFFFF", fontWeight: "800" },
  statsRow: { flexDirection: "row", gap: spacing.md },
  stat: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 22, fontWeight: "900", color: colors.onSurface },
  statLabel: { color: colors.muted, fontSize: font.sm },
  sectionTitle: { fontSize: font.base, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm },
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  thumb: { width: 54, height: 54, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  cTitle: { fontWeight: "800", color: colors.onSurface, fontSize: font.base },
  cSub: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  pillText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  metaText: { color: colors.muted, fontSize: font.sm },
  reject: { color: colors.error, fontSize: font.sm, marginTop: 4 },
  emptyTitle: { fontWeight: "800", color: colors.onSurface, fontSize: font.lg, textAlign: "center" },
  emptySub: { color: colors.muted, textAlign: "center" },
});
