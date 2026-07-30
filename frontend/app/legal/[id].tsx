import React, { useEffect } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme/tokens";

export default function LegalDocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    const sub = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        router.back();
        return true;
      }
    );

    return () => sub.remove();
  }, [router]);

  const docs: Record<
    string,
    {
      title: string;
      updated: string;
      body: string;
    }
  > = {
    terms: {
      title: "Terms of Service",
      updated: "July 2026",
      body: `
Welcome to Huni.

By creating an account and using Huni, you agree to use the platform responsibly and in accordance with these Terms.

• Respect other users.
• Do not impersonate others.
• Do not publish illegal, harmful or fraudulent content.
• Do not abuse bugs or attempt unauthorized access.
• Content violating our policies may be removed.
• Repeated violations may result in suspension or permanent account removal.

Huni may update these Terms from time to time. Continued use of the platform constitutes acceptance of any future revisions.
`,
    },

    privacy: {
      title: "Privacy Policy",
      updated: "July 2026",
      body: `
Your privacy matters to us.

Huni collects only the information necessary to operate and improve the platform.

Information we may collect includes:

• Account details
• Posts and comments
• Device information
• Login history
• Anonymous analytics

We do not sell your personal information.

Information is used only for providing services, maintaining security, and improving user experience.
`,
    },

    guidelines: {
      title: "Community Guidelines",
      updated: "July 2026",
      body: `
Huni exists to encourage healthy local discussions.

Please:

• Be respectful.
• Debate ideas, not people.
• Avoid hate speech and discrimination.
• Avoid spam and misinformation.
• Protect everyone's privacy.
• Report harmful content instead of engaging with it.

Our moderators may remove content or suspend accounts that repeatedly violate these guidelines.
`,
    },
  };

  const doc = docs[id ?? ""];

  if (!doc) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons
            name="document-text-outline"
            size={64}
            color={colors.muted}
          />

          <Text style={styles.notFoundTitle}>Document Not Found</Text>

          <Pressable
            style={styles.button}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          hitSlop={12}
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-back"
            size={26}
            color={colors.onSurface}
          />
        </Pressable>

        <Text style={styles.headerTitle}>
          {doc.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>
            {doc.title}
          </Text>

          <Text style={styles.updated}>
            Last Updated • {doc.updated}
          </Text>

          <Text style={styles.body}>
            {doc.body.trim()}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.onSurface,
  },

  content: {
    padding: spacing.lg,
  },

  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },

  updated: {
    fontSize: 13,
    color: colors.onSurfaceTertiary,
    marginBottom: spacing.xl,
  },

  body: {
    fontSize: font.base,
    lineHeight: 28,
    color: colors.onSurface,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },

  notFoundTitle: {
    marginTop: spacing.lg,
    fontSize: 24,
    fontWeight: "700",
    color: colors.onSurface,
  },

  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: radius.pill,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});