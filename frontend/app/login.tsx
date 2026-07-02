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
import { useAuth } from "@/src/context/auth";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

export default function Login() {
  const router = useRouter();
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={12} testID="back-btn">
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.sub}>Sign in to keep whispering.</Text>

          <Pressable
            style={[styles.googleBtn, googleLoading && { opacity: 0.7 }]}
            onPress={async () => {
              setError(null);
              setGoogleLoading(true);
              try {
                await signInWithGoogle();
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Google sign in failed");
              } finally {
                setGoogleLoading(false);
              }
            }}
            disabled={googleLoading}
            testID="google-login-btn"
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.onSurface} />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color={colors.onSurface} />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or use email</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
            />
          </View>

          {error && <Text style={styles.error} testID="login-error">{error}</Text>}

          <Pressable
            testID="login-submit-btn"
            onPress={submit}
            style={[styles.btn, loading && { opacity: 0.7 }]}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Log in</Text>}
          </Pressable>

          <Pressable onPress={() => router.replace("/signup")} testID="switch-to-signup" style={styles.switch}>
            <Text style={styles.switchText}>
              New here? <Text style={styles.switchLink}>Create an account</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  sub: { fontSize: font.base, color: colors.muted, lineHeight: 20 },
  field: { gap: spacing.xs },
  label: { fontSize: font.sm, fontWeight: "600", color: colors.onSurfaceTertiary },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.lg,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btn: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    marginTop: spacing.md,
  },
  btnText: { color: "#FFF", fontSize: font.lg, fontWeight: "700" },
  switch: { alignItems: "center", marginTop: spacing.md },
  switchText: { color: colors.muted, fontSize: font.base },
  switchLink: { color: colors.brand, fontWeight: "700" },
  error: { color: colors.error, fontSize: font.base, textAlign: "center" },
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
    marginTop: spacing.sm,
  },
  googleText: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: font.sm },
});
