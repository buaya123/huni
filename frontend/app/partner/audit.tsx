import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { colors, spacing, radius, font } from "@/src/theme/tokens";

type Audit = {

    id: string;

    created_at: string;

    campaign_title: string;

    scanner_alias: string;

    customer_alias: string;

    exp_awarded: number;

    tokens_awarded: number;

};

export default function PartnerAudit() {

    const router = useRouter();

    const [loading, setLoading] = useState(true);

    const [items, setItems] = useState<Audit[]>([]);

    const load = async () => {

        try {

            const rows = await api.get<Audit[]>("/partner/audit");

            setItems(rows);

        } finally {

            setLoading(false);

        }

    };

    useFocusEffect(

        useCallback(() => {

            load();

        }, [])

    );

    return (

        <SafeAreaView style={styles.wrap}>

            <View style={styles.top}>

                <Pressable onPress={() => router.back()}>

                    <Ionicons
                        name="chevron-back"
                        size={26}
                        color={colors.onSurface}
                    />

                </Pressable>

                <Text style={styles.title}>

                    Audit Trail

                </Text>

                <View style={{ width: 26 }} />

            </View>

            {

                loading ?

                <ActivityIndicator
                    style={{ marginTop: 40 }}
                />

                :

                <FlatList

                    data={items}

                    keyExtractor={(i) => i.id}

                    renderItem={({ item }) => (

                        <View style={styles.card}>

                            <Avatar
                                alias={item.customer_alias}
                                size={42}
                            />

                            <View style={{ flex: 1 }}>

                                <Text style={styles.campaign}>

                                    {item.campaign_title}

                                </Text>

                                <Text style={styles.meta}>

                                    Customer: {item.customer_alias}

                                </Text>

                                <Text style={styles.meta}>

                                    Scanner: {item.scanner_alias}

                                </Text>

                                <Text style={styles.meta}>

                                    +{item.exp_awarded} EXP • +{item.tokens_awarded} Tokens

                                </Text>

                                <Text style={styles.time}>

                                    {new Date(item.created_at).toLocaleString()}

                                </Text>

                            </View>

                        </View>

                    )}

                />

            }

        </SafeAreaView>

    );

}

const styles = StyleSheet.create({

    wrap: {

        flex: 1,

        backgroundColor: colors.surface,

    },

    top: {

        padding: spacing.md,

        flexDirection: "row",

        alignItems: "center",

        justifyContent: "space-between",

    },

    title: {

        fontWeight: "800",

        fontSize: font.lg,

        color: colors.onSurface,

    },

    card: {

        flexDirection: "row",

        gap: spacing.md,

        padding: spacing.md,

        marginHorizontal: spacing.md,

        marginBottom: spacing.sm,

        borderRadius: radius.md,

        borderWidth: 1,

        borderColor: colors.border,

        backgroundColor: colors.surfaceSecondary,

    },

    campaign: {

        fontWeight: "700",

        color: colors.onSurface,

    },

    meta: {

        color: colors.muted,

        marginTop: 2,

    },

    time: {

        color: colors.muted,

        marginTop: 6,

        fontSize: 12,

    },

});