import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { useWS } from "@/src/context/ws";
import { Avatar } from "@/src/components/Avatar";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_alias: string;
  content: string;
  created_at: string;
};

export default function ChatDetail() {
  const { id, alias, userId } = useLocalSearchParams<{ id: string; alias?: string; userId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { subscribe } = useWS();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<Message[]>(`/chat/${id}/messages`);
      setMessages(rows);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unsub = subscribe((ev) => {
      if (ev.type === "message" && ev.conversation_id === id) {
        const msg = ev.message as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });
    return unsub;
  }, [id, subscribe]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages.length]);

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const tmp = text.trim();
    setText("");
    try {
      const msg = await api.post<Message>(`/chat/${id}/messages`, { content: tmp });
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } catch {
      setText(tmp);
    } finally {
      setSending(false);
    }
  };

  const doBlock = async () => {
    setShowActions(false);
    if (!userId) return;
    try {
      await api.post("/block", { target_user_id: userId });
      router.back();
    } catch {
      // ignore
    }
  };

  const doReport = async () => {
    setShowActions(false);
    if (!userId) return;
    try {
      await api.post("/report", { target_type: "user", target_id: userId, reason: "Reported from chat" });
    } catch {
      // ignore
    }
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/messages"); }} hitSlop={12} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, marginLeft: spacing.sm }}>
          <Avatar alias={alias ?? "User"} size={32} />
          <Text style={styles.title} numberOfLines={1}>{alias ?? "Chat"}</Text>
        </View>
        <Pressable onPress={() => setShowActions((s) => !s)} hitSlop={12} testID="chat-actions-btn">
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {showActions && (
        <View style={styles.actionsSheet}>
          <Pressable style={styles.action} onPress={doReport} testID="report-user-btn">
            <Ionicons name="flag-outline" size={18} color={colors.onSurface} />
            <Text style={styles.actionText}>Report user</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={doBlock} testID="block-user-chat-btn">
            <Ionicons name="ban-outline" size={18} color={colors.error} />
            <Text style={[styles.actionText, { color: colors.error }]}>Block user</Text>
          </Pressable>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <FlatList
            testID="messages-list"
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            ListEmptyComponent={<Text style={styles.emptyText}>Say hi anonymously.</Text>}
            renderItem={({ item }) => {
              const mine = item.sender_id === user?.id;
              return (
                <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.otherRow]}>
                  <View style={[styles.bubble, mine ? styles.mine : styles.other]}>
                    <Text style={[styles.bubbleText, mine && { color: "#FFF" }]}>{item.content}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            testID="message-input"
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
          />
          <Pressable onPress={submit} disabled={!text.trim() || sending} style={styles.sendBtn} testID="send-message-btn">
            <Ionicons name="send" size={18} color={text.trim() ? "#FFF" : colors.muted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  actionsSheet: { marginHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.sm },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  actionText: { fontSize: font.base, color: colors.onSurface, fontWeight: "600" },
  emptyText: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  bubbleRow: { flexDirection: "row" },
  mineRow: { justifyContent: "flex-end" },
  otherRow: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
  },
  mine: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  other: { backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: font.base, color: colors.onSurface, lineHeight: 20 },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    maxHeight: 120, fontSize: font.base, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
});
