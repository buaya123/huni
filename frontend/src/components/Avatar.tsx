import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { aliasColor, aliasInitials, radius } from "@/src/theme/tokens";
import { imageUrl } from "@/src/api/client";

type Props = {
  alias: string;
  size?: number;
  /** When set, renders this base64/uploaded image inside the avatar circle instead of the initials. */
  avatarImageId?: string | null;
  /** When set, renders a decorative PNG ring around the avatar. The PNG should have a transparent center. */
  borderImageId?: string | null;
};

export function Avatar({ alias, size = 40, avatarImageId, borderImageId }: Props) {
  const bg = aliasColor(alias);
  const initials = aliasInitials(alias);

  // If a border is equipped, the whole thing gets a larger frame with the border image
  // laid over the outer ring. The avatar stays at `size` centered inside.
  const frameSize = borderImageId ? size * 1.35 : size;
  const avatar = (
<View
    style={[
        styles.wrap,
        {
            width: size,
            height: size,
            borderRadius: radius.pill,
            backgroundColor: bg,
        },
    ]}
>
      {avatarImageId ? (
        <Image
          source={{ uri: imageUrl(avatarImageId) }}
          style={{ width: size, height: size, borderRadius: radius.pill }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.text, { fontSize: size * 0.4 }]} numberOfLines={1}>
          {initials.toUpperCase()}
        </Text>
      )}
    </View>
  );

  if (!borderImageId) return avatar;

  return (
    <View
      style={{
        width: frameSize,
        height: frameSize,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {avatar}
      {/* Border image sits above the avatar. Its center must be transparent so the avatar shows through. */}
      <Image
        source={{ uri: imageUrl(borderImageId) }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: frameSize,
          height: frameSize,
        }}
        resizeMode="contain"
      />
    </View>
  );

}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  text: { color: "#FFFFFF", fontWeight: "700" },
});
