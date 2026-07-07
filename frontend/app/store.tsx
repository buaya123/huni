import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, imageUrl } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type StoreItem = {
  id: string;
  category: string;
  subcategory: string;
  name: string;
  description: string;
  price_tokens: number;
  stock: number;
  image_id?: string | null;
  enabled: boolean;
};

type CategoryDef = { id: string; label: string; icon: string };
type CategoriesResp = { categories: Record<string, CategoryDef[]> };

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  appearance: { label: "Appearance", icon: "color-palette-outline" },
  seasonal: { label: "Seasonal", icon: "snow-outline" },
  events: { label: "Events", icon: "ticket-outline" },
  collections: { label: "Collections", icon: "library-outline" },
};

export default function StoreScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<Record<string, CategoryDef[]>>({});
  const [items, setItems] = useState<StoreItem[]>([]);
  const [activeCat, setActiveCat] = useState<string>("appearance");
  const [tokens, setTokens] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cats, its, econ] = await Promise.all([
        api.get<CategoriesResp>("/store/categories"),
        api.get<StoreItem[]>("/store/items"),
        api.get<{ tokens: number }>("/me/economy").catch(() => ({ tokens: 0 })),
      ]);
      setCategories(cats.categories);
      setItems(its);
      setTokens(econ.tokens);
    } catch { /* ignore */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter((i) => i.category === activeCat), [items, activeCat]);
  const catList: [string, CategoryDef[]][] = useMemo(() => Object.entries(categories), [categories]);
  const subs = categories[activeCat] || [];

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Huni Store</Text>
        <Pressable onPress={() => router.push("/huni-guide")} hitSlop={12} testID="info-btn">
          <Ionicons name="information-circle-outline" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.balanceBar}>
        <Ionicons name="cash-outline" size={16} color={colors.onBrandTertiary} />
        <Text style={styles.balanceText}>{tokens.toLocaleString()} tokens</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsRow}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}
      >
        {catList.length === 0 && Object.keys(CATEGORY_LABELS).map((k) => (
          <Pressable key={k} style={[styles.tab, activeCat === k && styles.tabActive]} onPress={() => setActiveCat(k)} testID={`cat-${k}`}>
            <Ionicons name={CATEGORY_LABELS[k].icon as never} size={14} color={activeCat === k ? "#FFFFFF" : colors.brand} />
            <Text style={[styles.tabText, activeCat === k && { color: "#FFFFFF" }]}>{CATEGORY_LABELS[k].label}</Text>
          </Pressable>
        ))}
        {catList.map(([k]) => (
          <Pressable key={k} style={[styles.tab, activeCat === k && styles.tabActive]} onPress={() => setActiveCat(k)} testID={`cat-${k}`}>
            <Ionicons name={(CATEGORY_LABELS[k]?.icon || "grid-outline") as never} size={14} color={activeCat === k ? "#FFFFFF" : colors.brand} />
            <Text style={[styles.tabText, activeCat === k && { color: "#FFFFFF" }]}>{CATEGORY_LABELS[k]?.label ?? k}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {/* Subcategory chips */}
        {subs.length > 0 && (
          <View style={styles.subRow}>
            {subs.map((s) => (
              <View key={s.id} style={styles.subChip}>
                <Ionicons name={s.icon as never} size={12} color={colors.brand} />
                <Text style={styles.subChipText}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {loading ? (
          <View style={{ alignItems: "center", padding: spacing.xl }}><ActivityIndicator color={colors.brand} /></View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}><Ionicons name="cube-outline" size={36} color={colors.brand} /></View>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySub}>Huni admins are stocking the shelves. Drop in later!</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((item) => (
              <View key={item.id} style={styles.itemCard} testID={`item-${item.id}`}>
                {item.image_id ? (
                  <Image source={{ uri: imageUrl(item.image_id) }} style={styles.itemImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                    <Ionicons name="cube-outline" size={32} color={colors.muted} />
                  </View>
                )}
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                <View style={styles.itemFooter}>
                  <View style={styles.itemPrice}>
                    <Ionicons name="cash-outline" size={12} color={colors.onBrandTertiary} />
                    <Text style={styles.itemPriceText}>{item.price_tokens}</Text>
                  </View>
                  <Text style={styles.itemStock}>
                    {item.stock < 0 ? "∞" : `${item.stock} left`}
                  </Text>
                </View>
                <Pressable style={styles.comingSoon} disabled>
                  <Text style={styles.comingSoonText}>Coming soon</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  balanceBar: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, marginBottom: spacing.sm },
  balanceText: { color: colors.onBrandTertiary, fontWeight: "800" },
  tabsRow: { flexGrow: 0, paddingVertical: spacing.xs },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  tabActive: { backgroundColor: colors.brand },
  tabText: { color: colors.brand, fontWeight: "800", fontSize: font.sm },
  subRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  subChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  subChipText: { color: colors.onSurface, fontSize: 11, fontWeight: "600" },
  emptyBox: { alignItems: "center", gap: spacing.sm, padding: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontWeight: "800", color: colors.onSurface, fontSize: font.lg },
  emptySub: { color: colors.muted, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  itemCard: { width: "47%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.sm, gap: 4, borderWidth: 1, borderColor: colors.border },
  itemImage: { width: "100%", aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  itemImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  itemName: { fontWeight: "800", color: colors.onSurface, marginTop: spacing.xs },
  itemDesc: { color: colors.muted, fontSize: font.sm },
  itemFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  itemPrice: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  itemPriceText: { color: colors.onBrandTertiary, fontWeight: "900", fontSize: font.sm },
  itemStock: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  comingSoon: { marginTop: 6, backgroundColor: colors.surfaceTertiary, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center" },
  comingSoonText: { color: colors.muted, fontWeight: "800", fontSize: font.sm },
});
