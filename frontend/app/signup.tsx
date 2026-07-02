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

function formatDate(input: string): string {
  // Auto-format YYYY-MM-DD as the user types digits
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export default function SignUp() {
  const router = useRouter();
  const { signUp, signInWithGoogle } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) return setError("Please enter your first and last name.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return setError("Birthdate must be YYYY-MM-DD.");
    if (!email.trim()) return setError("Please enter your email.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setLoading(true);
    try {
      await signUp({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        birthdate,
        password,
      });
      router.replace("/(tabs)/home");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Google sign in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={12} testID="back-btn">
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.sub}>You will be given a random alias. Your real name stays private.</Text>

          <Pressable
            style={[styles.googleBtn, googleLoading && { opacity: 0.7 }]}
            onPress={google}
            disabled={googleLoading}
            testID="google-signup-btn"
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
            <Text style={styles.dividerText}>or sign up with email</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.row2}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>First name</Text>
              <TextInput
                testID="signup-firstname-input"
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Juan"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="words"
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Last name</Text>
              <TextInput
                testID="signup-lastname-input"
                value={lastName}
                onChangeText={setLastName}
                placeholder="Dela Cruz"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Birthdate (YYYY-MM-DD)</Text>
            <TextInput
              testID="signup-birthdate-input"
              value={birthdate}
              onChangeText={(v) => setBirthdate(formatDate(v))}
              placeholder="2000-01-15"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="signup-email-input"
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
              testID="signup-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
            />
          </View>

          {error && <Text style={styles.error} testID="signup-error">{error}</Text>}

          <Pressable
            testID="signup-submit-btn"
            onPress={submit}
            style={[styles.btn, loading && { opacity: 0.7 }]}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Create account</Text>}
          </Pressable>

          <Pressable onPress={() => router.replace("/login")} testID="switch-to-login" style={styles.switch}>
            <Text style={styles.switchText}>
              Already have an account? <Text style={styles.switchLink}>Log in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  sub: { fontSize: font.base, color: colors.muted, lineHeight: 20, marginBottom: spacing.sm },
  row2: { flexDirection: "row", gap: spacing.sm },
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
    marginTop: spacing.sm,
  },
  btnText: { color: "#FFF", fontSize: font.lg, fontWeight: "700" },
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
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: font.sm },
  switch: { alignItems: "center", marginTop: spacing.md },
  switchText: { color: colors.muted, fontSize: font.base },
  switchLink: { color: colors.brand, fontWeight: "700" },
  error: { color: colors.error, fontSize: font.base, textAlign: "center" },
});
