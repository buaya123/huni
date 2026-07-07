import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/auth";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

export default function Welcome() {
  const router = useRouter();
  const { signInWithGoogle } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

 const google = async () => {
  setError(null);
  setGoogleLoading(true);

  try {
    await signInWithGoogle();

    router.replace("/");

  } catch (e: unknown) {
    setError(e instanceof Error ? e.message : "Google sign in failed");
  } finally {
    setGoogleLoading(false);
  }
};

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.top}>
        <View style={styles.badge} testID="welcome-logo">
          <Text style={styles.badgeText}>hu.</Text>
        </View>
        <Text style={styles.title}>Huni</Text>
        <Text style={styles.tagline}>Honest. Local. Things.</Text>
      </View>

      <View style={styles.pointsBox}>
        <Point label="Get a stable alias — no real names shown." />
        <Point label="Post moods, ask advice, run local polls." />
        <Point label="Chat 1:1, block anyone, always private." />
      </View>

      <View style={{ gap: spacing.md }}>
        <Pressable
          testID="welcome-google-btn"
          style={[styles.googleBtn, googleLoading && { opacity: 0.7 }]}
          onPress={google}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <ActivityIndicator color={colors.onSurface} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={colors.onSurface} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          testID="welcome-signup-btn"
          style={styles.primaryBtn}
          onPress={() => router.replace("/signup")}
        >
          <Text style={styles.primaryBtnText}>Create account with email</Text>
        </Pressable>
        <Pressable
          testID="welcome-login-btn"
          style={styles.secondaryBtn}
          onPress={() => router.replace("/login")}
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
  pointsBox: { gap: spacing.md, marginVertical: spacing.lg },
  point: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 8 },
  pointText: { flex: 1, fontSize: font.base, color: colors.onSurface, lineHeight: 20 },
  googleBtn: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  googleText: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: font.sm },
  primaryBtn: {
    backgroundColor: colors.brand, paddingVertical: spacing.md, borderRadius: radius.pill, alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: font.lg, fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: colors.surfaceTertiary, paddingVertical: spacing.md, borderRadius: radius.pill, alignItems: "center",
  },
  secondaryBtnText: { color: colors.onSurface, fontSize: font.lg, fontWeight: "600" },
  disclaimer: { fontSize: font.sm, color: colors.muted, textAlign: "center", marginTop: spacing.xs, lineHeight: 18 },
  errorText: { color: colors.error, textAlign: "center", fontSize: font.sm },
});
