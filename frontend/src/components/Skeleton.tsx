import React, { useEffect, useRef } from "react";
import {
    Animated,
    StyleSheet,
    View,
    ViewStyle,
} from "react-native";

import { colors } from "@/src/theme/tokens";

type Props = {
    width?: number | string;
    height: number;
    style?: ViewStyle;
};

export function Skeleton({
    width = "100%",
    height,
    style,
}: Props) {

    const opacity = useRef(
        new Animated.Value(0.35)
    ).current;

    useEffect(() => {

        Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.7,
                    duration: 700,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.35,
                    duration: 700,
                    useNativeDriver: true,
                }),
            ])
        ).start();

    }, []);

    return (
        <Animated.View
            style={[
                styles.box,
                {
                    width,
                    height,
                    opacity,
                },
                style,
            ]}
        />
    );
}

const styles = StyleSheet.create({
    box: {
        backgroundColor: colors.surfaceTertiary,
        borderRadius: 8,
    },
});