import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { api } from "@/src/api/client";
import { pickImages, uploadImages, type PickedImage } from "@/src/utils/imagePicker";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

const MAX_IMAGES = 4;

export default function CreateAd() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [weight, setWeight] = useState(5);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addImages = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const picked = await pickImages(MAX_IMAGES - images.length);
      if (picked.length) setImages((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
    } finally {
      setPicking(false);
    }
  };

  const submit = async () => {
    if (!businessName.trim() || !title.trim() || !content.trim() || loading) {
      setError("Business name, title and description are required.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        business_name: businessName.trim(),
        title: title.trim(),
        content: content.trim(),
        frequency_weight: weight,
      };
      if (linkUrl.trim()) body.link_url = linkUrl.trim();
      if (images.length > 0) body.image_ids = await uploadImages(images);
      await api.post("/ads", body);
      router.replace("/ads");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create ad.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/ads"))} hitSlop={12} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>New Ad</Text>
        <View style={{ width: 26 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
          <Text style={styles.label}>Business name</Text>
          <TextInput
            testID="ad-business-input"
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="e.g. Buug Bakery"
            placeholderTextColor={colors.muted}
            maxLength={60}
            style={styles.input}
          />

          <Text style={styles.label}>Title</Text>
          <TextInput
            testID="ad-title-input"
            value={title}
            onChangeText={setTitle}
            placeholder="Catchy headline for your ad"
            placeholderTextColor={colors.muted}
            maxLength={100}
            style={styles.input}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            testID="ad-content-input"
            value={content}
            onChangeText={setContent}
            placeholder="Tell people about your offer..."
            placeholderTextColor={colors.muted}
            multiline
            maxLength={1000}
            style={styles.textarea}
          />

          <Text style={styles.label}>Link (optional)</Text>
          <TextInput
            testID="ad-link-input"
            value={linkUrl}
            onChangeText={setLinkUrl}
            placeholder="https://facebook.com/yourpage"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="url"
            style={styles.input}
          />

          <Text style={styles.label}>Photos ({images.length}/{MAX_IMAGES})</Text>
          <View style={styles.imageRow}>
            {images.map((img, idx) => (
              <View key={`${img.uri}-${idx}`} style={styles.imageThumbWrap} testID={`ad-picked-image-${idx}`}>
                <Image source={{ uri: img.uri }} style={styles.imageThumb} contentFit="cover" />
                <Pressable
                  style={styles.imageRemove}
                  onPress={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  hitSlop={8}
                  testID={`ad-remove-image-${idx}`}
                >
                  <Ionicons name="close" size={14} color="#FFF" />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_IMAGES && (
              <Pressable style={styles.addImageTile} onPress={addImages} testID="ad-add-images-btn">
                {picking ? (
                  <ActivityIndicator color={colors.brand} size="small" />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={22} color={colors.brand} />
                    <Text style={styles.addImageText}>Add</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>

          <Text style={styles.label}>Frequency weight</Text>
          <Text style={styles.hint}>Higher weight = your ad appears more often than others (1–10).</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setWeight((w) => Math.max(1, w - 1))}
              testID="weight-minus"
            >
              <Ionicons name="remove" size={20} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.weightValue} testID="weight-value">{weight}</Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setWeight((w) => Math.min(10, w + 1))}
              testID="weight-plus"
            >
              <Ionicons name="add" size={20} color={colors.onSurface} />
            </Pressable>
          </View>

          {error && <Text style={styles.error} testID="ad-error">{error}</Text>}

          <Pressable
            style={[styles.btn, loading && { opacity: 0.6 }]}
            onPress={submit}
            disabled={loading}
            testID="ad-submit-btn"
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Publish ad</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  label: { fontSize: font.sm, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: font.sm, color: colors.muted, marginTop: -6 },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: font.base, color: colors.onSurface, borderWidth: 1, borderColor: colors.border,
  },
  textarea: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: font.base, color: colors.onSurface, minHeight: 110,
    textAlignVertical: "top", borderWidth: 1, borderColor: colors.border,
  },
  imageRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  imageThumbWrap: { position: "relative" },
  imageThumb: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  imageRemove: {
    position: "absolute", top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center",
  },
  addImageTile: {
    width: 76, height: 76, borderRadius: radius.md,
    borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.brand,
    alignItems: "center", justifyContent: "center", gap: 2,
  },
  addImageText: { fontSize: 11, color: colors.brand, fontWeight: "700" },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  stepBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  weightValue: { fontSize: 24, fontWeight: "800", color: colors.onSurface, minWidth: 36, textAlign: "center" },
  error: { color: colors.error, fontSize: font.sm },
  btn: {
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingVertical: spacing.md, alignItems: "center", marginTop: spacing.sm, minHeight: 48, justifyContent: "center",
  },
  btnText: { color: "#FFF", fontWeight: "800", fontSize: font.base },
});
