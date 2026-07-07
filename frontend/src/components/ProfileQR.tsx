import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import QRCode from "qrcode";
import { colors, radius } from "@/src/theme/tokens";

export function ProfileQR({ userId, size = 220 }: { userId: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(`huni:user:${userId}`, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: size * 2,
      color: { dark: "#2A2826", light: "#FFFFFF" },
    })
      .then((url) => { if (alive) setDataUrl(url); })
      .catch(() => { if (alive) setDataUrl(null); });
    return () => { alive = false; };
  }, [userId, size]);

  return (
    <View style={[styles.wrap, { width: size + 24, height: size + 24 }]}> 
      {dataUrl ? (
        <Image source={{ uri: dataUrl }} style={{ width: size, height: size }} resizeMode="contain" />
      ) : (
        <ActivityIndicator color={colors.brand} />
      )}
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
