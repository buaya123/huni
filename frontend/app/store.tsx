import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, imageUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
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
  hex_color?: string | null;
  style_slot?: "bg_color" | "bg_pattern" | "border" | "avatar" | null;
  enabled: boolean;
};

type Purchase = { purchase_id: string; purchased_at: string; price_paid: number; item: StoreItem };
type EquippedStyles = Record<string, { item_id: string; image_id: string | null; hex_color: string | null; name: string } | null>;

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
  const { refresh } = useAuth();
  const [categories, setCategories] = useState<Record<string, CategoryDef[]>>({});
  const [items, setItems] = useState<StoreItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [equipped, setEquipped] = useState<EquippedStyles>({});
  const [activeCat, setActiveCat] = useState<string>("appearance");
  const [tokens, setTokens] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cats, its, econ, purch, equ] = await Promise.all([
        api.get<CategoriesResp>("/store/categories"),
        api.get<StoreItem[]>("/store/items"),
        api.get<{ tokens: number }>("/me/economy").catch(() => ({ tokens: 0 })),
        api.get<Purchase[]>("/me/purchases").catch(() => [] as Purchase[]),
        api.get<EquippedStyles>("/me/equipped_styles").catch(() => ({} as EquippedStyles)),
      ]);
      setCategories(cats.categories);
      setItems(its);
      setTokens(econ.tokens);
      setPurchases(purch);
      setEquipped(equ);
    } catch { /* ignore */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const ownedIds = useMemo(() => new Set(purchases.map((p) => p.item.id)), [purchases]);
  const equippedIds = useMemo(() => new Set(Object.values(equipped).filter(Boolean).map((v) => v!.item_id)), [equipped]);

  const filtered = useMemo(() => items.filter((i) => i.category === activeCat), [items, activeCat]);
  const catList: [string, CategoryDef[]][] = useMemo(() => Object.entries(categories), [categories]);
  const subs = categories[activeCat] || [];

  const doBuy = async (item: StoreItem) => {
    Alert.alert(
      "Buy this item?",
      `${item.name} — ${item.price_tokens} tokens\n\nYou have ${tokens.toLocaleString()} tokens.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Buy",
          onPress: async () => {
            setBusyId(item.id);
            try {
              const r = await api.post<{ tokens: number }>(`/store/items/${item.id}/purchase`);
              setTokens(r.tokens);
              await load();
              refresh();
            } catch (e) {
              Alert.alert("Purchase failed", e instanceof Error ? e.message : "Try again");
            } finally { setBusyId(null); }
          },
        },
      ]
    );
  };

  const doEquip = async (item: StoreItem, unequip: boolean) => {
    if (!item.style_slot) return;
    setBusyId(item.id);
    try {
      await api.post<EquippedStyles>("/me/equip", {
        slot: item.style_slot,
        item_id: unequip ? null : item.id,
      });
      await load();
      refresh();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not equip");
    } finally { setBusyId(null); }
  };

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
            {filtered.map((item) => {
              const owned = ownedIds.has(item.id);
              const isEquipped = equippedIds.has(item.id);
              const isBusy = busyId === item.id;
              return (
                <View key={item.id} style={styles.itemCard} testID={`item-${item.id}`}>
                  <View style={styles.itemImageBox}>
                    {item.hex_color ? (
                      <View style={[styles.itemImage, { backgroundColor: item.hex_color }]} />
                    ) : item.image_id ? (
                      <Image source={{ uri: imageUrl(item.image_id) }} style={styles.itemImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                        <Ionicons name="cube-outline" size={32} color={colors.muted} />
                      </View>
                    )}
                    {isEquipped && (
                      <View style={styles.equippedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                        <Text style={styles.equippedText}>Equipped</Text>
                      </View>
                    )}
                    {owned && !isEquipped && (
                      <View style={styles.ownedBadge}>
                        <Ionicons name="bag-check-outline" size={12} color={colors.onBrandTertiary} />
                        <Text style={styles.ownedText}>Owned</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                  <View style={styles.itemFooter}>
                    <View style={styles.itemPrice}>
                      <Ionicons name="cash-outline" size={12} color={colors.onBrandTertiary} />
                      <Text style={styles.itemPriceText}>{item.price_tokens}</Text>
                    </View>
                    <Text style={styles.itemStock}>{item.stock < 0 ? "∞" : `${item.stock} left`}</Text>
                  </View>

                  {isBusy ? (
                    <View style={styles.actionBtn}><ActivityIndicator color={colors.brand} /></View>
                  ) : owned ? (
                    item.style_slot ? (
                      isEquipped ? (
                        <Pressable style={[styles.actionBtn, styles.actionGhost]} onPress={() => doEquip(item, true)} testID={`unequip-${item.id}`}>
                          <Text style={[styles.actionText, { color: colors.onSurface }]}>Unequip</Text>
                        </Pressable>
                      ) : (
                        <Pressable style={[styles.actionBtn, styles.actionEquip]} onPress={() => doEquip(item, false)} testID={`equip-${item.id}`}>
                          <Ionicons name="checkmark-circle-outline" size={14} color="#FFFFFF" />
                          <Text style={styles.actionText}>Equip</Text>
                        </Pressable>
                      )
                    ) : (
                      <View style={[styles.actionBtn, styles.actionGhost]}>
                        <Text style={[styles.actionText, { color: colors.muted }]}>Owned</Text>
                      </View>
                    )
                  ) : (
                    <Pressable
                      style={[styles.actionBtn, tokens < item.price_tokens ? styles.actionDisabled : styles.actionBuy]}
                      onPress={() => doBuy(item)}
                      disabled={tokens < item.price_tokens}
                      testID={`buy-${item.id}`}
                    >
                      <Ionicons name="cart-outline" size={14} color="#FFFFFF" />
                      <Text style={styles.actionText}>{tokens < item.price_tokens ? "Need more tokens" : "Buy"}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
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
  itemImageBox: { position: "relative" },
  itemImage: { width: "100%", aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  itemImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  itemName: { fontWeight: "800", color: colors.onSurface, marginTop: spacing.xs },
  itemDesc: { color: colors.muted, fontSize: font.sm },
  itemFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  itemPrice: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  itemPriceText: { color: colors.onBrandTertiary, fontWeight: "900", fontSize: font.sm },
  itemStock: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  actionBtn: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: radius.pill },
  actionBuy: { backgroundColor: colors.brand },
  actionEquip: { backgroundColor: "#28a745" },
  actionGhost: { backgroundColor: colors.surfaceTertiary },
  actionDisabled: { backgroundColor: colors.surfaceTertiary },
  actionText: { color: "#FFFFFF", fontWeight: "800", fontSize: font.sm },
  equippedBadge: { position: "absolute", top: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#28a745", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  equippedText: { color: "#FFFFFF", fontWeight: "900", fontSize: 10 },
  ownedBadge: { position: "absolute", top: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  ownedText: { color: colors.onBrandTertiary, fontWeight: "900", fontSize: 10 },
});
