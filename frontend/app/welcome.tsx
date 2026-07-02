import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

export default function Welcome() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.top}>
        <View style={styles.badge} testID="welcome-logo">
          <Text style={styles.badgeText}>hu.</Text>
        </View>
        <Text style={styles.title}>Huni</Text>
        <Text style={styles.tagline}>Whisper honestly. Share freely. Stay anonymous. Respect others.</Text>
      </View>

      <View style={styles.pointsBox}>
        <Point label="Get a stable alias — no real names." />
        <Point label="Post moods, ask advice, run local polls." />
        <Point label="Chat 1:1, block anyone, always private." />
      </View>

      <View style={{ gap: spacing.md }}>
        <Pressable
          testID="welcome-signup-btn"
          style={styles.primaryBtn}
          onPress={() => router.push("/signup")}
        >
          <Text style={styles.primaryBtnText}>Create account</Text>
        </Pressable>
        <Pressable
          testID="welcome-login-btn"
          style={styles.secondaryBtn}
          onPress={() => router.push("/login")}
        >
          <Text style={styles.secondaryBtnText}>I already have an account</Text>
        </Pressable>
        <Text style={styles.disclaimer}>
          By continuing you agree to keep others safe: no doxxing, threats, harassment, or illegal content.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Point({ label }: { label: string }) {
  return (
    <View style={styles.point}>
      <View style={styles.dot} />
      <Text style={styles.pointText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, justifyContent: "space-between" },
  top: { alignItems: "flex-start", marginTop: spacing.xxl },
  badge: {
    width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.lg,
  },
  badgeText: { color: "#FFFFFF", fontSize: 32, fontWeight: "800" },
  title: { fontSize: 42, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  tagline: { fontSize: font.lg, color: colors.onSurfaceTertiary, lineHeight: 24 },
  pointsBox: { gap: spacing.md, marginVertical: spacing.xl },
  point: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 8 },
  pointText: { flex: 1, fontSize: font.base, color: colors.onSurface, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: colors.brand, paddingVertical: spacing.lg, borderRadius: radius.pill, alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: font.lg, fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: colors.surfaceTertiary, paddingVertical: spacing.lg, borderRadius: radius.pill, alignItems: "center",
  },
  secondaryBtnText: { color: colors.onSurface, fontSize: font.lg, fontWeight: "600" },
  disclaimer: { fontSize: font.sm, color: colors.muted, textAlign: "center", marginTop: spacing.sm, lineHeight: 18 },
});
