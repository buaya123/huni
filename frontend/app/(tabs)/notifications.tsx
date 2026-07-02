import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type Notif = {
  id: string;
  type: string;
  actor_alias?: string;
  content_preview?: string;
  post_id?: string;
  conversation_id?: string;
  created_at: string;
  read: boolean;
};

function typeMeta(t: string) {
  switch (t) {
    case "comment": return { icon: "chatbubble-outline" as const, text: "commented on your post" };
    case "reaction": return { icon: "heart-outline" as const, text: "reacted to your post" };
    case "message": return { icon: "paper-plane-outline" as const, text: "sent you a message" };
    default: return { icon: "notifications-outline" as const, text: "update" };
  }
}

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<Notif[]>("/notifications");
      setItems(rows);
      await api.post("/notifications/read-all");
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (n: Notif) => {
    if (n.post_id) router.push(`/post/${n.post_id}`);
    else if (n.conversation_id) router.push(`/chat/${n.conversation_id}`);
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          testID="notif-list"
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          ListEmptyComponent={<EmptyState title="No notifications yet." subtitle="You'll get pings when people react or comment." />}
          renderItem={({ item }) => {
            const meta = typeMeta(item.type);
            return (
              <Pressable
                onPress={() => open(item)}
                style={[styles.row, !item.read && styles.unread]}
                testID={`notif-item-${item.id}`}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name={meta.icon} size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.line}>
                    <Text style={styles.alias}>{item.actor_alias ?? "Someone"}</Text> {meta.text}
                  </Text>
                  {item.content_preview && <Text style={styles.preview} numberOfLines={1}>{`"${item.content_preview}"`}</Text>}
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg },
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    alignItems: "center",
  },
  unread: { backgroundColor: colors.brandTertiary },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { fontSize: font.base, color: colors.onSurface },
  alias: { fontWeight: "700" },
  preview: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  time: { fontSize: 11, color: colors.muted, marginTop: 4 },
});
