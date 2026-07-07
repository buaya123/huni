import React from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/auth";
import { ProfileQR } from "@/src/components/ProfileQR";
import { Avatar } from "@/src/components/Avatar";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

export default function QRScreen() {
  const router = useRouter();
  const { user } = useAuth();
  if (!user) return null;

  const share = async () => {
    try {
      await Share.share({
        message: `Hi! Scan my Huni QR to redeem local perks — huni:user:${user.id}`,
      });
    } catch { /* ignore */ }
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))} hitSlop={12} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Your QR</Text>
        <Pressable onPress={share} hitSlop={12} testID="share-qr">
          <Ionicons name="share-outline" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Avatar alias={user.alias} size={64} />
          <Text style={styles.alias}>{user.alias}</Text>
          <Text style={styles.hint}>Show this to a Huni partner to earn points & discounts.</Text>
          <View style={{ marginTop: spacing.lg }}>
            <ProfileQR userId={user.id} size={230} />
          </View>
          <View style={styles.pointsPill}>
            <Ionicons name="sparkles" size={16} color={colors.onBrandTertiary} />
            <Text style={styles.pointsText}>{user.points ?? 0} Huni points</Text>
          </View>

          <Pressable style={styles.link} onPress={() => router.push("/rewards")} testID="view-rewards">
            <Ionicons name="gift-outline" size={18} color={colors.brand} />
            <Text style={styles.linkText}>View my rewards & history</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          <Pressable style={styles.link} onPress={() => router.push("/perks")} testID="browse-perks">
            <Ionicons name="pricetags-outline" size={18} color={colors.brand} />
            <Text style={styles.linkText}>Browse local perks</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  body: { padding: spacing.lg, alignItems: "center", paddingBottom: spacing.xxl },
  card: {
    width: "100%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  alias: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  hint: { color: colors.muted, textAlign: "center", fontSize: font.sm },
  pointsPill: {
    marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brandTertiary,
  },
  pointsText: { color: colors.onBrandTertiary, fontWeight: "800" },
  link: {
    marginTop: spacing.md, width: "100%", flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary,
  },
  linkText: { flex: 1, color: colors.onSurface, fontWeight: "600" },
});
