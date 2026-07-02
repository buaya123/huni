import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type Conv = {
  id: string;
  other: { id: string; alias: string };
  last_message: string | null;
  last_message_at: string | null;
  unread: number;
};

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function Messages() {
  const router = useRouter();
  const [items, setItems] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<Conv[]>("/chat/conversations");
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <Text style={styles.sub}>Anonymous 1:1 conversations.</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          testID="conv-list"
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          ListEmptyComponent={<EmptyState title="No messages yet." subtitle="Start a chat from a post or user profile." />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/chat/${item.id}?alias=${encodeURIComponent(item.other.alias)}&userId=${item.other.id}`)}
              style={styles.row}
              testID={`conv-${item.id}`}
            >
              <Avatar alias={item.other.alias} size={48} />
              <View style={{ flex: 1 }}>
                <View style={styles.topRow}>
                  <Text style={styles.alias}>{item.other.alias}</Text>
                  <Text style={styles.time}>{timeAgo(item.last_message_at)}</Text>
                </View>
                <View style={styles.bottomRow}>
                  <Text style={[styles.preview, item.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                    {item.last_message ?? "Say hi!"}
                  </Text>
                  {item.unread > 0 && (
                    <View style={styles.unreadDot}>
                      <Text style={styles.unreadText}>{item.unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg },
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  sub: { color: colors.muted, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  alias: { fontSize: font.base, fontWeight: "700", color: colors.onSurface },
  time: { fontSize: font.sm, color: colors.muted },
  preview: { flex: 1, fontSize: font.sm, color: colors.muted },
  previewUnread: { color: colors.onSurface, fontWeight: "600" },
  unreadDot: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  unreadText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
});
