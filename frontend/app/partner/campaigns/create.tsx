import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

export default function CreateCampaign() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");
  const [terms, setTerms] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (title.trim().length < 2 || description.trim().length < 2) {
      Alert.alert("Missing info", "Add a title and description.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/partner/campaigns", {
        title: title.trim(),
        description: description.trim(),
        discount_label: discountLabel.trim(),
        terms: terms.trim(),
        start_date: startDate.trim() || null,
        end_date: endDate.trim() || null,
        visible_to: "owner",
        allowed_partners: [],
      });
      Alert.alert(
        "Submitted",
        "Sent to Huni admins for approval. They'll set the EXP + Token allocation for your campaign package.",
        [{ text: "OK", onPress: () => router.replace("/partner") }],
      );
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>New Campaign</Text>
        <View style={{ width: 26 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={18} color={colors.brand} />
            <Text style={styles.infoText}>
              Describe your offer. Huni admins will decide the EXP & Token payout per redemption when they approve your campaign package.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Campaign title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Anniversary Promo" placeholderTextColor={colors.muted} maxLength={80} testID="campaign-title" />
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, { minHeight: 120 }]} value={description} onChangeText={setDescription} placeholder="What's the offer? Any conditions? What's the vibe?" placeholderTextColor={colors.muted} multiline maxLength={1000} testID="campaign-desc" />
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>In-store discount (optional)</Text>
            <TextInput style={styles.input} value={discountLabel} onChangeText={setDiscountLabel} placeholder="e.g. 10% off any drink, Free pastry" placeholderTextColor={colors.muted} maxLength={80} testID="discount-input" />
            <Text style={styles.hint}>What perk does the customer receive in-store when they show up? EXP & Tokens are separate — set by admin.</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Terms (optional)</Text>
            <TextInput style={[styles.input, { minHeight: 60 }]} value={terms} onChangeText={setTerms} placeholder="One per person, valid only in-store, ..." placeholderTextColor={colors.muted} multiline maxLength={500} testID="terms-input" />
          </View>

          <View style={styles.rowGap}>
            <View style={[styles.section, { flex: 1 }]}>
              <Text style={styles.label}>Start (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="optional" placeholderTextColor={colors.muted} autoCapitalize="none" />
            </View>
            <View style={[styles.section, { flex: 1 }]}>
              <Text style={styles.label}>End (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="optional" placeholderTextColor={colors.muted} autoCapitalize="none" />
            </View>
          </View>

          <Pressable style={styles.submit} onPress={submit} disabled={saving} testID="submit-campaign">
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Submit for approval</Text>}
          </Pressable>
          <Text style={styles.footnote}>Approval usually takes a few hours. You&apos;ll be notified.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  section: { gap: 6 },
  label: { fontWeight: "700", color: colors.onSurface, fontSize: font.sm },
  hint: { color: colors.muted, fontSize: font.sm },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: font.base, color: colors.onSurface, borderWidth: 1, borderColor: colors.border,
  },
  rowGap: { flexDirection: "row", gap: spacing.md },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md },
  infoText: { flex: 1, color: colors.onBrandTertiary, fontSize: font.sm, lineHeight: 18 },
  submit: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: spacing.md },
  submitText: { color: "#FFFFFF", fontWeight: "800", fontSize: font.base },
  footnote: { color: colors.muted, fontSize: font.sm, textAlign: "center" },
});
