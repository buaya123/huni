import React, { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { colors } from "@/src/theme/tokens";

export default function LaunchScreen() {
  const scale = useSharedValue(1.45);
const translateY = useSharedValue(0);
const opacity = useSharedValue(1);

useEffect(() => {
  withSpring(1,{
    damping:16,
    stiffness:90,
    mass:1,
})
}, []);

const logoStyle = useAnimatedStyle(() => ({
  transform: [{ scale: scale.value }],
}));

  return (
  <Animated.View style={[styles.container]}>
    <Animated.View style={[styles.badge, logoStyle]}>
      <Text style={styles.badgeText}>hu.</Text>
    </Animated.View>

    <Animated.Text
    entering={FadeIn.delay(250).duration(300)}
    style={styles.title}
>

    <Animated.Text
    entering={FadeIn.delay(400).duration(300)}
    style={styles.tagline}
>
      Honest. Local. Things.
    </Animated.Text>
    </Animated.Text>
  </Animated.View>
);
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },

  badge: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: colors.brand,
    justifyContent: "center",
    alignItems: "center",
  },

  badgeText: {
    color: "#FFF",
    fontSize: 54,
    fontWeight: "800",
  },

  title: {
    marginTop: 28,
    fontSize: 42,
    fontWeight: "800",
    color: "#111111"
  },

  tagline: {
    marginTop: 8,
    fontSize: 18,
    color: colors.muted,
  },
});