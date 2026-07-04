import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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

type AdminUser = {
  id: string;
  alias: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "user" | "advertiser" | "admin";
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

export default function AdminPanel() {
  const router = useRouter();
  const { user } = useAuth();
  const [everyN, setEveryN] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [ads, setAds] = useState<AdminAd[]>([]);

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    try {
      const [s, allAds] = await Promise.all([
        api.get<{ ad_every_n_posts: number }>("/admin/settings"),
        api.get<AdminAd[]>("/admin/ads"),
      ]);
      setEveryN(s.ad_every_n_posts);
      setAds(allAds);
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

  const setRole = async (u: AdminUser, role: "user" | "advertiser") => {
    try {
      await api.post(`/admin/users/${u.id}/role`, { role });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
    } catch { /* ignore */ }
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
              <View style={[styles.roleChip, u.role === "admin" && styles.roleChipAdmin, u.role === "advertiser" && styles.roleChipAdv]}>
                <Text style={styles.roleText}>{u.role}</Text>
              </View>
              {u.role === "user" && (
                <Pressable style={styles.promoteBtn} onPress={() => setRole(u, "advertiser")} testID={`promote-${u.id}`}>
                  <Text style={styles.promoteText}>Make advertiser</Text>
                </Pressable>
              )}
              {u.role === "advertiser" && (
                <Pressable style={[styles.promoteBtn, styles.demoteBtn]} onPress={() => setRole(u, "user")} testID={`demote-${u.id}`}>
                  <Text style={[styles.promoteText, { color: colors.error }]}>Revoke</Text>
                </Pressable>
              )}
            </View>
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
  roleText: { fontSize: 10, fontWeight: "800", color: colors.onSurface, textTransform: "uppercase" },
  promoteBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brand,
  },
  demoteBtn: { backgroundColor: colors.surfaceTertiary },
  promoteText: { color: "#FFF", fontWeight: "700", fontSize: 11 },
  adRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  emptyText: { color: colors.muted, fontSize: font.sm },
});
