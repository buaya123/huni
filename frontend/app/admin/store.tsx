import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { api, imageUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { pickImages, uploadImages } from "@/src/utils/imagePicker";
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
  hex_color?: string | null;
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
  image_id: string | null;
  hex_color: string;
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
  image_id: null,
  hex_color: "",
});

// Contextual guidance shown in the admin form based on the selected subcategory.
const SUB_HELP: Record<string, { title: string; specs: string[]; dos: string[]; donts: string[] }> = {
  background_colors: {
    title: "Background Colors",
    specs: ["No image needed", "Just a hex value (e.g. #FF7A45)"],
    dos: ["Pick colors with strong contrast against white text", "Prefer saturated hues for visual pop"],
    donts: ["Don't use near-white / near-black colors", "Don't upload an image — leave the picker empty"],
  },
  patterns: {
    title: "Background Patterns",
    specs: ["Recommended size: 1200×400 (banner strip) OR a seamless 512×512 tile", "PNG or JPG, under 500 KB"],
    dos: ["Keep contrast subtle so text stays readable", "For tiled patterns, make edges seamless"],
    donts: ["Don't include user photos or copyrighted textures", "Don't use very busy patterns"],
  },
  borders: {
    title: "Profile Borders (tricky — read carefully!)",
    specs: [
      "REQUIRED: 512×512 PNG with transparency",
      "Center circle diameter ≈ 380px (≈74% of image width) MUST be fully transparent",
      "Draw only the decorative ring/frame in the outer area",
    ],
    dos: [
      "Keep the transparent circle perfectly centered",
      "Test the PNG against a photo background before uploading",
      "Use anti-aliased edges for a clean ring",
    ],
    donts: [
      "Don't fill the center — the avatar shows through it",
      "Don't upload JPG (no transparency support)",
      "Don't extend art outside the 512×512 square — it will be cropped",
    ],
  },
  avatar_packs: {
    title: "Avatar Packs",
    specs: ["Recommended size: 512×512 square PNG", "Transparent background optional"],
    dos: ["Center the subject in the square", "Keep faces / focal points inside the middle 80% of the canvas"],
    donts: ["Don't upload rectangular images (they'll be cropped to square)", "Don't include text or watermarks"],
  },
};

export default function AdminStore() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [categories, setCategories] = useState<Record<string, CategoryDef[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [deleteItem, setDeleteItem] = useState<StoreItem | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const pickAndUploadImage = async () => {
    try {
      setUploading(true);
      const picked = await pickImages(1);
      if (picked.length === 0) return;
      const [id] = await uploadImages(picked);
      setEditing((s) => s && { ...s, image_id: id });
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload image");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { Alert.alert("Missing name", "Give the item a name."); return; }
    if (Number(editing.price_tokens) < 0) { Alert.alert("Invalid price", "Price must be 0 or more."); return; }
    // Slot-specific validation
    if (editing.category === "appearance" && editing.subcategory === "background_colors") {
      if (!/^#[0-9A-Fa-f]{6}$/.test(editing.hex_color.trim())) {
        Alert.alert("Missing hex color", "Background Color items need a hex like #FF7A45.");
        return;
      }
    }
    if (editing.category === "appearance" && (editing.subcategory === "patterns" || editing.subcategory === "borders" || editing.subcategory === "avatar_packs")) {
      if (!editing.image_id) {
        Alert.alert("Missing image", "This item type requires an image. Please upload one.");
        return;
      }
    }
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
        image_id: editing.image_id,
        hex_color: editing.hex_color.trim() ? editing.hex_color.trim() : null,
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

  // const removeItem = (item: StoreItem) => {
  //   Alert.alert("Delete item?", `Remove "${item.name}" from the store?`, [
  //     { text: "Cancel", style: "cancel" },
  //     { text: "Delete", style: "destructive", onPress: async () => {
  //       try { await api.del(`/admin/store/items/${item.id}`); load(); }
  //       catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Could not delete"); }
  //     } },
  //   ]);
  // };
  const removeItem = (item: StoreItem) => {
    setDeleteItem(item);
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;

    setDeleting(true);

    try {
        await api.del(`/admin/store/items/${deleteItem.id}`);

        setDeleteItem(null);

        load();
    } catch (e) {
        Alert.alert(
            "Error",
            e instanceof Error ? e.message : "Could not delete"
        );
    } finally {
        setDeleting(false);
    }
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
                <View
                  key={item.id}
                  style={styles.itemRow}
                  testID={`store-item-${item.id}`}
                >
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() =>
                      setEditing({
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
                        image_id: item.image_id ?? null,
                        hex_color: item.hex_color ?? "",
                      })
                    }
                  >
                    <Text style={styles.itemName}>{item.name}</Text>

                    <Text style={styles.itemMeta} numberOfLines={1}>
                      {item.subcategory} · {item.price_tokens} tokens ·{" "}
                      {item.stock < 0 ? "∞" : `${item.stock} stock`}
                    </Text>

                    {!!item.description && (
                      <Text style={styles.itemDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                    )}
                  </Pressable>
                  <View
                      style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing.sm,
                      }}
                  >

                  <Switch
                    value={item.enabled}
                    onValueChange={(v) => toggleEnabled(item, v)}
                    trackColor={{
                      true: colors.brand,
                      false: colors.surfaceTertiary,
                    }}
                    testID={`toggle-${item.id}`}
                  />

                  <Pressable
                    onPress={() => {
                        console.log("DELETE PRESSED");
                        removeItem(item);
                    }}
                    hitSlop={8}
                    style={{
                        padding: 12,
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    <Ionicons
                        name="trash-outline"
                        size={20}
                        color={colors.error}
                    />
                </Pressable>
                </View>
                </View>
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

              {/* Contextual guidance for the selected subcategory */}
              {editing && SUB_HELP[editing.subcategory] && (
                <View style={styles.helpBox}>
                  <Text style={styles.helpTitle}>{SUB_HELP[editing.subcategory].title}</Text>
                  {SUB_HELP[editing.subcategory].specs.map((s, i) => (
                    <Text key={`s${i}`} style={styles.helpSpec}>• {s}</Text>
                  ))}
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.helpHead}>Do</Text>
                      {SUB_HELP[editing.subcategory].dos.map((d, i) => (
                        <Text key={`d${i}`} style={styles.helpItem}>✓ {d}</Text>
                      ))}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.helpHead, { color: colors.error }]}>Don&apos;t</Text>
                      {SUB_HELP[editing.subcategory].donts.map((d, i) => (
                        <Text key={`x${i}`} style={styles.helpItem}>✗ {d}</Text>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {/* Hex color — only for background_colors */}
              {editing?.category === "appearance" && editing?.subcategory === "background_colors" && (
                <Field label="Hex color (e.g. #FF7A45)">
                  <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={editing?.hex_color || ""}
                      onChangeText={(v) => setEditing((s) => s && { ...s, hex_color: v })}
                      placeholder="#FF7A45"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="characters"
                      maxLength={7}
                      testID="hex-input"
                    />
                    {/^#[0-9A-Fa-f]{6}$/.test(editing?.hex_color || "") && (
                      <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: editing.hex_color, borderWidth: 1, borderColor: colors.border }} />
                    )}
                  </View>
                </Field>
              )}

              {/* Preview image — shown for everything except pure background_colors */}
              {!(editing?.category === "appearance" && editing?.subcategory === "background_colors") && (
                <Field label={editing?.subcategory === "borders" ? "Border PNG (transparent center)" : "Preview image"}>
                  <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
                    {editing?.image_id ? (
                      <Image source={{ uri: imageUrl(editing.image_id) }} style={styles.previewImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.previewImg, { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary }]}>
                        <Ionicons name="image-outline" size={24} color={colors.muted} />
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 6 }}>
                      <Pressable style={styles.uploadBtn} onPress={pickAndUploadImage} disabled={uploading} testID="upload-image-btn">
                        {uploading ? <ActivityIndicator color="#FFFFFF" /> : (
                          <>
                            <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
                            <Text style={styles.uploadBtnText}>{editing?.image_id ? "Replace image" : "Upload image"}</Text>
                          </>
                        )}
                      </Pressable>
                      {editing?.image_id && (
                        <Pressable onPress={() => setEditing((s) => s && { ...s, image_id: null })}>
                          <Text style={styles.removeText}>Remove image</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </Field>
              )}
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
      <Modal
    transparent
    visible={!!deleteItem}
    animationType="fade"
    onRequestClose={() => setDeleteItem(null)}
>
    <View style={styles.confirmBg}>
        <View style={styles.confirmCard}>

            <View style={styles.confirmIcon}>
                <Ionicons
                    name="trash-outline"
                    size={30}
                    color={colors.error}
                />
            </View>

            <Text style={styles.confirmTitle}>
                Delete Item?
            </Text>

            <Text style={styles.confirmBody}>
                "{deleteItem?.name}" will be permanently removed from the Huni
                Store.
            </Text>

            <Text style={styles.confirmWarning}>
                This action cannot be undone.
            </Text>

            <View style={styles.confirmButtons}>

                <Pressable
                    style={styles.cancelBtn}
                    onPress={() => setDeleteItem(null)}
                    disabled={deleting}
                >
                    <Text style={styles.cancelText}>
                        Cancel
                    </Text>
                </Pressable>

                <Pressable
                    style={styles.deleteBtn}
                    onPress={confirmDelete}
                    disabled={deleting}
                >
                    {deleting ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <>
                            <Ionicons
                                name="trash"
                                size={16}
                                color="#FFF"
                            />
                            <Text style={styles.deleteText}>
                                Delete
                            </Text>
                        </>
                    )}
                </Pressable>

            </View>

        </View>
    </View>
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
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md, maxHeight: "92%" },
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
  helpBox: {
    padding: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brand, gap: 4,
  },
  helpTitle: { fontWeight: "900", color: colors.onBrandTertiary, fontSize: font.sm },
  helpSpec: { color: colors.onBrandTertiary, fontSize: font.sm },
  helpHead: { fontWeight: "800", color: colors.brand, fontSize: 11, textTransform: "uppercase", marginBottom: 2 },
  helpItem: { color: colors.onSurface, fontSize: 12, marginTop: 2 },
  previewImg: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, paddingVertical: 10, borderRadius: radius.pill },
  uploadBtnText: { color: "#FFFFFF", fontWeight: "800" },
  removeText: { color: colors.error, fontWeight: "700", fontSize: font.sm, textAlign: "center" },
confirmBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
},

confirmCard: {
    width: "88%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.md,
},

confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
},

confirmTitle: {
    fontSize: font.lg,
    fontWeight: "900",
    color: colors.onSurface,
},

confirmBody: {
    textAlign: "center",
    color: colors.onSurface,
},

confirmWarning: {
    textAlign: "center",
    color: colors.muted,
    fontSize: font.sm,
},

confirmButtons: {
    flexDirection: "row",
    width: "100%",
    gap: spacing.md,
    marginTop: spacing.sm,
},

cancelBtn: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    paddingVertical: 13,
    borderRadius: radius.pill,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
},

cancelText: {
    color: colors.onSurface,
    fontWeight: "800",
},

deleteBtn: {
    flex: 1,
    backgroundColor: colors.error,
    paddingVertical: 13,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
},

deleteText: {
    color: "#FFF",
    fontWeight: "800",
},
});
