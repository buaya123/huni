import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { EmptyState } from "@/src/components/EmptyState";
import {
    colors,
    spacing,
    radius,
    font,
} from "@/src/theme/tokens";

type Partner = {
    id: string;
    business_name: string;
};

export default function PartnerSelect() {

    const [loading, setLoading] = useState(true);

    const [items, setItems] = useState<Partner[]>([]);

    useEffect(() => {

        api.get<Partner[]>("/scanner/partners")
            .then((rows) => {

                setItems(rows);

                if (rows.length === 1) {

                    router.replace({

                        pathname: "/partner/scan",

                        params: {

                            partner_id: rows[0].id,

                        },

                    });

                }

            })
            .finally(() => setLoading(false));

    }, []);

    if (items.length === 1) {
        return null;
    }

    return (

        <SafeAreaView
            style={styles.wrap}
            edges={["top", "bottom"]}
        >

            <View style={styles.topBar}>

                <Pressable
                    onPress={() => router.back()}
                    hitSlop={12}
                >

                    <Ionicons
                        name="chevron-back"
                        size={26}
                        color={colors.onSurface}
                    />

                </Pressable>

                <Text style={styles.title}>

                    Choose Partner

                </Text>

                <View style={{ width: 26 }} />

            </View>

            <Text style={styles.subtitle}>

                Select the partner you're scanning for.

            </Text>

            {

                loading ?

                <View style={styles.center}>

                    <ActivityIndicator
                        color={colors.brand}
                    />

                </View>

                :

                items.length === 0 ?

                <EmptyState
                    title="No partner assignments"
                    subtitle="You haven't been assigned as a scanner yet."
                />

                :

                <ScrollView
                    contentContainerStyle={styles.list}
                >

                    {
                        items.map((p) => (

                            <Pressable
                                key={p.id}
                                style={styles.card}
                                onPress={() => {

                                    router.push({

                                        pathname: "/partner/scan",

                                        params: {

                                            partner_id: p.id,

                                        },

                                    });

                                }}
                            >

                                <Avatar
                                    alias={p.business_name}
                                    size={48}
                                />

                                <View style={{ flex: 1 }}>

                                    <Text
                                        style={styles.name}
                                        numberOfLines={1}
                                    >

                                        {p.business_name}

                                    </Text>

                                    <Text
                                        style={styles.type}
                                    >

                                        Partner

                                    </Text>

                                </View>

                                <Ionicons
                                    name="chevron-forward"
                                    size={20}
                                    color={colors.muted}
                                />

                            </Pressable>

                        ))
                    }

                </ScrollView>

            }

        </SafeAreaView>

    );

}

const styles = StyleSheet.create({

    wrap: {
        flex: 1,
        backgroundColor: colors.surface,
    },

    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },

    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: spacing.md,
    },

    title: {
        fontSize: font.lg,
        fontWeight: "700",
        color: colors.onSurface,
    },

    subtitle: {
        color: colors.muted,
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.md,
    },

    list: {
        padding: spacing.lg,
        gap: spacing.sm,
        paddingBottom: spacing.xxl,
    },

    card: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        backgroundColor: colors.surfaceSecondary,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
    },

    name: {
        fontWeight: "800",
        color: colors.onSurface,
        fontSize: font.base,
    },

    type: {
        color: colors.muted,
        fontSize: font.sm,
        marginTop: 2,
    },

});