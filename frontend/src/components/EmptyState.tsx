import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, font, spacing } from "@/src/theme/tokens";

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.sub}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", padding: spacing.xl, marginTop: spacing.xxl },
  title: { fontSize: font.xl, fontWeight: "700", color: colors.onSurface, textAlign: "center", marginBottom: spacing.sm },
  sub: { fontSize: font.base, color: colors.muted, textAlign: "center", lineHeight: 20 },
});
