import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, font, moodMeta, radius, spacing } from "@/src/theme/tokens";

export function MoodChip({ mood, small }: { mood: string; small?: boolean }) {
  const m = moodMeta(mood);
  return (
    <View style={[styles.chip, small && styles.chipSmall]} testID={`mood-chip-${mood}`}>
      <Text style={[styles.emoji, small && styles.emojiSmall]}>{m.emoji}</Text>
      <Text style={[styles.label, small && styles.labelSmall]}>{m.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  chipSmall: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  emoji: {
    fontSize: font.base,
    marginRight: 6,
  },
  emojiSmall: {
    fontSize: font.sm,
    marginRight: 4,
  },
  label: {
    color: colors.onBrandTertiary,
    fontSize: font.sm,
    fontWeight: "600",
  },
  labelSmall: {
    fontSize: 11,
  },
});
