import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type RewardType = "points" | "discount" | "both";

export default function CreateCampaign() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rewardType, setRewardType] = useState<RewardType>("points");
  const [pointsAmount, setPointsAmount] = useState("25");
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
    if ((rewardType === "points" || rewardType === "both") && Number(pointsAmount) <= 0) {
      Alert.alert("Missing points", "Enter a positive points amount.");
      return;
    }
    if ((rewardType === "discount" || rewardType === "both") && !discountLabel.trim()) {
      Alert.alert("Missing discount", "Describe the discount (e.g. '10% off drinks').");
      return;
    }
    setSaving(true);
    try {
      await api.post("/partner/campaigns", {
        title: title.trim(),
        description: description.trim(),
        reward_type: rewardType,
        points_amount: Number(pointsAmount) || 0,
        discount_label: discountLabel.trim(),
        terms: terms.trim(),
        start_date: startDate.trim() || null,
        end_date: endDate.trim() || null,
      });
      Alert.alert("Submitted", "Your campaign has been sent to admins for approval.", [
        { text: "OK", onPress: () => router.replace("/partner") },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not submit";
      Alert.alert("Error", msg);
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
          <View style={styles.section}>
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Free brew for locals" placeholderTextColor={colors.muted} maxLength={80} testID="campaign-title" />
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, { minHeight: 100 }]} value={description} onChangeText={setDescription} placeholder="What does the offer include? Any conditions?" placeholderTextColor={colors.muted} multiline maxLength={1000} testID="campaign-desc" />
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Reward type</Text>
            <View style={styles.chipsRow}>
              {(
                [
                  { k: "points", i: "sparkles", l: "Points" },
                  { k: "discount", i: "pricetag", l: "Discount" },
                  { k: "both", i: "gift", l: "Both" },
                ] as const
              ).map((x) => (
                <Pressable
                  key={x.k}
                  onPress={() => setRewardType(x.k)}
                  style={[styles.chip, rewardType === x.k && styles.chipActive]}
                  testID={`reward-${x.k}`}
                >
                  <Ionicons name={x.i as never} size={14} color={rewardType === x.k ? "#FFFFFF" : colors.brand} />
                  <Text style={[styles.chipText, rewardType === x.k && { color: "#FFFFFF" }]}>{x.l}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {(rewardType === "points" || rewardType === "both") && (
            <View style={styles.section}>
              <Text style={styles.label}>Points awarded per redemption</Text>
              <TextInput style={styles.input} value={pointsAmount} onChangeText={setPointsAmount} keyboardType="number-pad" placeholder="25" placeholderTextColor={colors.muted} testID="points-input" />
            </View>
          )}
          {(rewardType === "discount" || rewardType === "both") && (
            <View style={styles.section}>
              <Text style={styles.label}>Discount label</Text>
              <TextInput style={styles.input} value={discountLabel} onChangeText={setDiscountLabel} placeholder="e.g. 10% off any drink" placeholderTextColor={colors.muted} maxLength={80} testID="discount-input" />
            </View>
          )}

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
          <Text style={styles.footnote}>Admins review new campaigns to keep Huni safe & local.</Text>
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
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: font.base, color: colors.onSurface, borderWidth: 1, borderColor: colors.border,
  },
  chipsRow: { flexDirection: "row", gap: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  chipActive: { backgroundColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "700", fontSize: font.sm },
  rowGap: { flexDirection: "row", gap: spacing.md },
  submit: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: spacing.md },
  submitText: { color: "#FFFFFF", fontWeight: "800", fontSize: font.base },
  footnote: { color: colors.muted, fontSize: font.sm, textAlign: "center" },
});
