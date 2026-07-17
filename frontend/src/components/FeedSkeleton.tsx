import React from "react";
import { StyleSheet, View } from "react-native";
import { Animated } from "react-native";
import { useEffect, useRef } from "react";

import {
    radius,
    shadow,
    spacing,
    colors,
} from "@/src/theme/tokens";

import { SkeletonBone } from "./SkeletonBone";

export function FeedSkeleton() {

    const shimmer = useRef(new Animated.Value(-150)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.timing(shimmer, {
                toValue: 350,
                duration: 1200,
                useNativeDriver: true,
            })
        );

        animation.start();

        return () => animation.stop();
    }, []);

    return (

        <View style={styles.card}>

            <View style={styles.header}>

                <SkeletonBone
                    shimmer={shimmer}
                    width={36}
                    height={36}
                    borderRadius={18}
                />

                <View style={styles.headerText}>

                    <SkeletonBone
                    shimmer={shimmer}
                        width={120}
                        height={14}
                    />

                    <View style={{ height: 8 }} />

                    <SkeletonBone
                    shimmer={shimmer}
                        width={80}
                        height={10}
                    />

                </View>

                <SkeletonBone
                shimmer={shimmer}
                    width={58}
                    height={24}
                    borderRadius={radius.pill}
                />

            </View>

            <SkeletonBone
            shimmer={shimmer}
                width="72%"
                height={22}
            />

            <View style={{ height: spacing.md }} />

            <SkeletonBone
            shimmer={shimmer}
                width="100%"
                height={13}
            />

            <View style={{ height: 8 }} />

            <SkeletonBone
            shimmer={shimmer}
                width="95%"
                height={13}
            />

            <View style={{ height: 8 }} />

            <SkeletonBone
            shimmer={shimmer}
                width="63%"
                height={13}
            />

            <View style={{ height: spacing.md }} />

            <SkeletonBone
            shimmer={shimmer}
                width="100%"
                height={220}
                borderRadius={radius.md}
            />

            <View style={styles.footer}>

                <SkeletonBone
                shimmer={shimmer}
                    width={70}
                    height={28}
                    borderRadius={radius.pill}
                />

                <SkeletonBone
                shimmer={shimmer}
                    width={55}
                    height={28}
                    borderRadius={radius.pill}
                />

            </View>

        </View>

    );

}

const styles = StyleSheet.create({

    card: {
        backgroundColor: colors.surfaceSecondary,
        borderRadius: radius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
        ...shadow.card,
    },

    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: spacing.md,
    },

    headerText: {
        flex: 1,
        marginHorizontal: spacing.md,
    },

    footer: {
        marginTop: spacing.md,
        flexDirection: "row",
        justifyContent: "space-between",
    },

});