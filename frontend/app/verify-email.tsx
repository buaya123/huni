import React, { useEffect, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { useAuth, User } from "@/src/context/auth";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

export default function VerifyEmail() {
    
  const { finishLogin } = useAuth();

  const router = useRouter();

  const { email } = useLocalSearchParams<{
    email: string;
  }>();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(60);
const [sending, setSending] = useState(false);
const [message, setMessage] = useState("");

useEffect(() => {
  if (countdown <= 0) return;

  const timer = setInterval(() => {
    setCountdown((c) => c - 1);
  }, 1000);

  return () => clearInterval(timer);
}, [countdown]);

const resend = async () => {
  if (countdown > 0 || sending) return;

  setSending(true);
  setError("");
  setMessage("");

  try {
    await api.post("/auth/resend-verification", {
      email,
    });

    setCode("");
    setCountdown(60);
    setMessage("A new verification code has been sent.");
  } catch (e: any) {
    setError(
      e?.response?.data?.detail ??
      "Unable to resend verification code."
    );
  } finally {
    setSending(false);
  }
};

  const verify = async (enteredCode = code) => {
  if (enteredCode.length !== 6) {
    setError("Please enter the 6-digit code.");
    return;
  }

  setLoading(true);
  setError("");

  try {
    const res = await api.post<{
      token: string;
      user: User;
    }>("/auth/verify-email", {
      email,
      code: enteredCode,
    });

    await finishLogin(res.token, res.user);

    router.replace("/(tabs)/home");
  } catch (e: any) {
    const status = e?.response?.status;
    const detail =
    e?.response?.data?.detail ??
    e?.message ??
    "Verification failed.";

    if (status === 410) {
    setCode("");
    setCountdown(0);
    }

    setError(detail);
    
  } finally {
    setLoading(false);
  }
};


  return (
    <SafeAreaView style={styles.wrap}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >

          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons
              name="chevron-back"
              size={26}
              color={colors.onSurface}
            />
          </Pressable>

          <Text style={styles.title}>
            Verify your email
          </Text>

          <Text style={styles.sub}>
            We sent a verification code to
          </Text>

          <Text style={styles.email}>
            {email}
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>
              Verification Code
            </Text>

            <TextInput
                value={code}
                onChangeText={(v) => {
                    const value = v.replace(/\D/g, "");
                    setCode(value);

                    if (value.length === 6 && !loading) {
                    verify(value);
                    }
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="123456"
                placeholderTextColor={colors.muted}
                style={styles.input}
                />
          </View>

          {!!error && (
            <Text style={styles.error}>
              {error}
            </Text>
          )}
          {!!message && (
  <Text
    style={{
      color: colors.brand,
      textAlign: "center",
      fontWeight: "600",
    }}
  >
    {message}
  </Text>
)}

          <Pressable
            style={[
              styles.btn,
              loading && { opacity: 0.7 },
            ]}
            disabled={loading}
            onPress={() => verify(code)}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.btnText}>
                Verify Email
              </Text>
            )}
          </Pressable>
<View
  style={{
    alignItems: "center",
    marginTop: spacing.md,
  }}
>
  {countdown > 0 ? (
    <Text style={{ color: colors.muted }}>
      Resend code in {countdown}s
    </Text>
  ) : (
    <Pressable
      disabled={sending}
      onPress={resend}
    >
      <Text
        style={{
          color: colors.brand,
          fontWeight: "700",
        }}
      >
        {sending ? "Sending..." : "Resend Code"}
      </Text>
    </Pressable>
  )}
</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.surface,
  },

  scroll: {
    padding: spacing.xl,
    gap: spacing.lg,
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: spacing.md,
  },

  sub: {
    color: colors.muted,
    fontSize: font.base,
  },

  email: {
    color: colors.brand,
    fontWeight: "700",
    fontSize: font.base,
  },

  field: {
    gap: spacing.xs,
  },

  label: {
    color: colors.onSurfaceTertiary,
    fontWeight: "600",
    fontSize: font.sm,
  },

  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    fontSize: 28,
    textAlign: "center",
    letterSpacing: 12,
  },

  btn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },

  btnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: font.lg,
  },

  error: {
    color: colors.error,
    textAlign: "center",
  },
});