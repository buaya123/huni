import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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

type StoreItem = {
  id: string;
  category: string;
  subcategory: string;
  name: string;
  description: string;
  price_tokens: number;
  stock: number;
  enabled: boolean;
  active_from?: string | null;
  active_until?: string | null;
  sort_order: number;
  image_id?: string | null;
};

type CategoryDef = { id: string; label: string; icon: string };
type CategoriesResp = { categories: Record<string, CategoryDef[]> };

const CATEGORY_LABEL: Record<string, string> = {
  appearance: "Appearance",
  seasonal: "Seasonal",
  events: "Events",
  collections: "Collections",
};

type FormState = {
  id?: string;
  category: string;
  subcategory: string;
  name: string;
  description: string;
  price_tokens: string;
  stock: string;
  enabled: boolean;
  active_from: string;
  active_until: string;
  sort_order: string;
};

const emptyForm = (): FormState => ({
  category: "appearance",
  subcategory: "background_colors",
  name: "",
  description: "",
  price_tokens: "50",
  stock: "-1",
  enabled: true,
  active_from: "",
  active_until: "",
  sort_order: "0",
});

export default function AdminStore() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [categories, setCategories] = useState<Record<string, CategoryDef[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<FormState | null>(null);

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    try {
      const [cats, rows] = await Promise.all([
        api.get<CategoriesResp>("/store/categories"),
        api.get<StoreItem[]>("/admin/store/items"),
      ]);
      setCategories(cats.categories);
      setItems(rows);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, [isAdmin, load]);

  const submit = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { Alert.alert("Missing name", "Give the item a name."); return; }
    if (Number(editing.price_tokens) < 0) { Alert.alert("Invalid price", "Price must be 0 or more."); return; }
    setSaving(true);
    try {
      const payload = {
        category: editing.category,
        subcategory: editing.subcategory,
        name: editing.name.trim(),
        description: editing.description.trim(),
        price_tokens: Number(editing.price_tokens) || 0,
        stock: Number(editing.stock) || -1,
        enabled: editing.enabled,
        active_from: editing.active_from.trim() || null,
        active_until: editing.active_until.trim() || null,
        sort_order: Number(editing.sort_order) || 0,
      };
      if (editing.id) {
        await api.patch(`/admin/store/items/${editing.id}`, payload);
      } else {
        await api.post("/admin/store/items", payload);
      }
      setEditing(null);
      load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (item: StoreItem) => {
    Alert.alert("Delete item?", `Remove "${item.name}" from the store?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.del(`/admin/store/items/${item.id}`); load(); }
        catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Could not delete"); }
      } },
    ]);
  };

  const toggleEnabled = async (item: StoreItem, v: boolean) => {
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, enabled: v } : x)));
    try { await api.patch(`/admin/store/items/${item.id}`, { enabled: v }); }
    catch { setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, enabled: !v } : x))); }
  };

  const grouped = useMemo(() => {
    const g: Record<string, StoreItem[]> = {};
    for (const item of items) {
      (g[item.category] ||= []).push(item);
    }
    return g;
  }, [items]);

  const subOptions = editing ? (categories[editing.category] || []) : [];

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
          <Text style={styles.title}>Store Manager</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.muted} />
          <Text style={styles.hint}>Admins only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Store Manager</Text>
        <Pressable onPress={() => setEditing(emptyForm())} hitSlop={12} testID="add-item-btn">
          <Ionicons name="add-circle" size={26} color={colors.brand} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={40} color={colors.muted} />
          <Text style={styles.hint}>No items yet. Tap + to create your first Huni Store item.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => setEditing(emptyForm())} testID="create-first-item">
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.primaryText}>Create item</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
          {Object.keys(grouped).map((cat) => (
            <View key={cat} style={{ gap: spacing.sm }}>
              <Text style={styles.catHeader}>{CATEGORY_LABEL[cat] ?? cat} · {grouped[cat].length}</Text>
              {grouped[cat].map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() => setEditing({
                    id: item.id,
                    category: item.category,
                    subcategory: item.subcategory,
                    name: item.name,
                    description: item.description || "",
                    price_tokens: String(item.price_tokens ?? 0),
                    stock: String(item.stock ?? -1),
                    enabled: item.enabled,
                    active_from: item.active_from || "",
                    active_until: item.active_until || "",
                    sort_order: String(item.sort_order ?? 0),
                  })}
                  testID={`store-item-${item.id}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta} numberOfLines={1}>
                      {item.subcategory} · {item.price_tokens} tokens · {item.stock < 0 ? "∞" : `${item.stock} stock`}
                    </Text>
                    {!!item.description && (
                      <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                    )}
                  </View>
                  <Switch
                    value={item.enabled}
                    onValueChange={(v) => toggleEnabled(item, v)}
                    trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                    testID={`toggle-${item.id}`}
                  />
                  <Pressable onPress={() => removeItem(item)} hitSlop={8} testID={`delete-${item.id}`}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal transparent visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{editing?.id ? "Edit item" : "New item"}</Text>
              <Pressable onPress={() => setEditing(null)} hitSlop={12}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }} keyboardShouldPersistTaps="handled">
              <Field label="Name">
                <TextInput style={styles.input} value={editing?.name || ""} onChangeText={(v) => setEditing((s) => s && { ...s, name: v })} placeholder="e.g. Sunset Orange Background" placeholderTextColor={colors.muted} testID="item-name-input" />
              </Field>
              <Field label="Description">
                <TextInput style={[styles.input, { minHeight: 60 }]} value={editing?.description || ""} onChangeText={(v) => setEditing((s) => s && { ...s, description: v })} placeholder="Optional description" placeholderTextColor={colors.muted} multiline testID="item-desc-input" />
              </Field>
              <Field label="Category">
                <View style={styles.chipsRow}>
                  {Object.keys(categories).map((k) => (
                    <Pressable
                      key={k}
                      style={[styles.chip, editing?.category === k && styles.chipActive]}
                      onPress={() => setEditing((s) => s && { ...s, category: k, subcategory: (categories[k]?.[0]?.id) || "" })}
                      testID={`cat-${k}`}
                    >
                      <Text style={[styles.chipText, editing?.category === k && { color: "#FFFFFF" }]}>{CATEGORY_LABEL[k] ?? k}</Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <Field label="Subcategory">
                <View style={styles.chipsRow}>
                  {subOptions.map((s) => (
                    <Pressable
                      key={s.id}
                      style={[styles.chip, editing?.subcategory === s.id && styles.chipActive]}
                      onPress={() => setEditing((st) => st && { ...st, subcategory: s.id })}
                      testID={`sub-${s.id}`}
                    >
                      <Ionicons name={s.icon as never} size={12} color={editing?.subcategory === s.id ? "#FFFFFF" : colors.brand} />
                      <Text style={[styles.chipText, editing?.subcategory === s.id && { color: "#FFFFFF" }]}>{s.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="Price (tokens)">
                    <TextInput style={styles.input} value={editing?.price_tokens || ""} onChangeText={(v) => setEditing((s) => s && { ...s, price_tokens: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" placeholder="50" placeholderTextColor={colors.muted} testID="price-input" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Stock (-1 = ∞)">
                    <TextInput style={styles.input} value={editing?.stock || ""} onChangeText={(v) => setEditing((s) => s && { ...s, stock: v.replace(/[^0-9-]/g, "") })} keyboardType="numbers-and-punctuation" placeholder="-1" placeholderTextColor={colors.muted} testID="stock-input" />
                  </Field>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="Active from (YYYY-MM-DD)">
                    <TextInput style={styles.input} value={editing?.active_from || ""} onChangeText={(v) => setEditing((s) => s && { ...s, active_from: v })} placeholder="optional" placeholderTextColor={colors.muted} autoCapitalize="none" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Active until (YYYY-MM-DD)">
                    <TextInput style={styles.input} value={editing?.active_until || ""} onChangeText={(v) => setEditing((s) => s && { ...s, active_until: v })} placeholder="optional" placeholderTextColor={colors.muted} autoCapitalize="none" />
                  </Field>
                </View>
              </View>
              <Field label="Sort order (lower = first)">
                <TextInput style={styles.input} value={editing?.sort_order || ""} onChangeText={(v) => setEditing((s) => s && { ...s, sort_order: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} />
              </Field>
              <View style={styles.toggleRow}>
                <Text style={styles.label}>Enabled (visible to users)</Text>
                <Switch
                  value={editing?.enabled ?? true}
                  onValueChange={(v) => setEditing((s) => s && { ...s, enabled: v })}
                  trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                />
              </View>
            </ScrollView>

            <Pressable style={styles.submit} onPress={submit} disabled={saving} testID="save-item">
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{editing?.id ? "Save changes" : "Create item"}</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg },
  hint: { color: colors.muted, textAlign: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill },
  primaryText: { color: "#FFFFFF", fontWeight: "800" },
  catHeader: { fontWeight: "900", color: colors.brand, textTransform: "uppercase", fontSize: 12, letterSpacing: 1 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  itemName: { fontWeight: "800", color: colors.onSurface, fontSize: font.base },
  itemMeta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  itemDesc: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.md, maxHeight: "92%" },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontWeight: "900", fontSize: font.lg, color: colors.onSurface },
  label: { fontWeight: "800", color: colors.onSurface, fontSize: font.sm },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  chipActive: { backgroundColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "700", fontSize: font.sm },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  submit: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  submitText: { color: "#FFFFFF", fontWeight: "800" },
});
