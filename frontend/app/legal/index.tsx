import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/auth";
import { useEffect } from "react";
import { api } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import Checkbox from "expo-checkbox";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { BackHandler } from "react-native";
export default function LegalScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [agreed, setAgreed] = useState(false);
const [loading, setLoading] = useState(false);

  useEffect(() => {
  const sub = BackHandler.addEventListener(
    "hardwareBackPress",
    () => true
  );

  return () => sub.remove();
}, []);

  useEffect(() => {
    if (!user) return;

    if (user.accepted_terms) {
router.replace("/");
    }
  }, [user, router]);

const accept = async () => {
  if (!agreed || loading) return;

  setLoading(true);

  try {
    await api.post("/legal/accept");
    await refresh();
    router.replace("/");
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        <Text style={styles.title}>
          Before you continue
        </Text>

        <Text style={styles.body}>
          To use Huni, you must agree to our Terms of Service,
          Privacy Policy, and Community Guidelines.
        </Text>

        <Pressable
          style={styles.link}
          onPress={() => router.push("/legal/terms")}
        >
          <Text style={styles.linkText}>
            Terms of Service
          </Text>
        </Pressable>

        <Pressable
          style={styles.link}
          onPress={() => router.push("/legal/privacy")}
        >
          <Text style={styles.linkText}>
            Privacy Policy
          </Text>
        </Pressable>

        <Pressable
          style={styles.link}
          onPress={() => router.push("/legal/guidelines")}
        >
          <Text style={styles.linkText}>
            Community Guidelines
          </Text>
        </Pressable>

        <View
            style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: spacing.md,
                marginTop: spacing.lg,
            }}
            >
            <Checkbox
                value={agreed}
                onValueChange={setAgreed}
                color={agreed ? colors.brand : undefined}
            />

            <Text
                style={{
                flex: 1,
                color: colors.onSurface,
                lineHeight: 20,
                }}
            >
                I have read and agree to the Terms of Service, Privacy Policy, and
                Community Guidelines.
            </Text>
        </View>

        <Pressable
            style={[
                styles.button,
                (!agreed || loading) && {
                    opacity: 0.5,
                },
            ]}
            disabled={!agreed || loading}
            onPress={accept}
        >
          {loading ? (
                <ActivityIndicator color="#fff" />
            ) : (
                <Text style={styles.buttonText}>
                    I Agree & Continue
                </Text>
            )}
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.onSurface,
  },
  body: {
    fontSize: font.base,
    color: colors.onSurfaceTertiary,
    lineHeight: 22,
  },
  link: {
    paddingVertical: spacing.md,
  },
  linkText: {
    color: colors.brand,
    fontSize: font.lg,
    fontWeight: "600",
  },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: font.lg,
  },
});