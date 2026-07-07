import React from "react";
import { StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { colors, radius } from "@/src/theme/tokens";

export function ProfileQR({ userId, size = 220 }: { userId: string; size?: number }) {
  return (
    <View style={[styles.wrap, { width: size + 24, height: size + 24 }]} testID="profile-qr">
      <QRCode
        value={`huni:user:${userId}`}
        size={size}
        color="#2A2826"
        backgroundColor="#FFFFFF"
        ecl="M"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
