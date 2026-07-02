import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { aliasColor, aliasInitials, radius } from "@/src/theme/tokens";

type Props = {
  alias: string;
  size?: number;
};

export function Avatar({ alias, size = 40 }: Props) {
  const bg = aliasColor(alias);
  const initials = aliasInitials(alias);
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius.pill, backgroundColor: bg },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.4 }]} numberOfLines={1}>
        {initials.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  text: { color: "#FFFFFF", fontWeight: "700" },
});
