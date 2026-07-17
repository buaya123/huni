import React from "react";
import {
    Animated,
    DimensionValue,
    StyleSheet,
    View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
    colors,
    radius,
} from "@/src/theme/tokens";

type Props = {
    width: DimensionValue;
    height: number;
    borderRadius?: number;
    shimmer: Animated.Value;
};

export function SkeletonBone({
    width,
    height,
    borderRadius = radius.sm,
    shimmer,
}: Props) {

    return (
        <View
            style={[
                styles.container,
                {
                    width,
                    height,
                    borderRadius,
                },
            ]}
        >
            <Animated.View
                style={[
                    styles.shimmerContainer,
                    {
                        transform: [
                            {
                                translateX: shimmer,
                            },
                        ],
                    },
                ]}
            >
                <LinearGradient
                    colors={[
                        "transparent",
                        "rgba(255,255,255,0.45)",
                        "transparent",
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.shimmer}
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surfaceTertiary,
        overflow: "hidden",
    },

    shimmerContainer: {
        ...StyleSheet.absoluteFillObject,
    },

    shimmer: {
        width: 120,
        height: "100%",
    },
});