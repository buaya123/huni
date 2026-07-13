import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardEvent,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  InteractionManager,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
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

type ConversationStatus = {
  blocked: boolean;
  blocked_by_me: boolean;
  blocked_by_other: boolean;
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
  const [status, setStatus] = useState<ConversationStatus>({
    blocked: false,
    blocked_by_me: false,
    blocked_by_other: false,
  });
  const [showActions, setShowActions] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const scrollOffset = useRef(0);
const contentHeight = useRef(0);
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const shouldScrollToBottom = useRef(true);
  const PAGE_SIZE = 30;

  const [offset, setOffset] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

const load = useCallback(async () => {
    try {

        const [rows, conversationStatus] = await Promise.all([
            api.get<Message[]>(
                `/chat/${id}/messages?offset=0&limit=${PAGE_SIZE}`
            ),
            api.get<ConversationStatus>(
                `/chat/${id}/status`
            ),
        ]);

        setMessages(rows);

        setStatus(conversationStatus);

        setOffset(rows.length);

        setHasOlder(rows.length === PAGE_SIZE);

    } catch {

        setMessages([]);

        setHasOlder(false);

    } finally {

        setLoading(false);

    }

}, [id]);

const loadOlder = useCallback(async () => {

    if (loadingOlder || !hasOlder)
        return;

    try {

        setLoadingOlder(true);

        const beforeHeight = contentHeight.current;

        const rows = await api.get<Message[]>(
            `/chat/${id}/messages?offset=${offset}&limit=${PAGE_SIZE}`
        );

        if (rows.length === 0) {

            setHasOlder(false);
            return;

        }

        setMessages(prev => [...rows, ...prev]);

        setOffset(prev => prev + rows.length);

        if (rows.length < PAGE_SIZE)
            setHasOlder(false);



            requestAnimationFrame(() => {

                const addedHeight =
                    contentHeight.current - beforeHeight;

                listRef.current?.scrollToOffset({
                    offset: scrollOffset.current + addedHeight,
                    animated: false,
                });


        });

    } finally {

        setLoadingOlder(false);

    }

}, [id, offset, hasOlder, loadingOlder]);

  useEffect(() => { load(); }, [load]);

useEffect(() => {
    const unsub = subscribe((ev) => {
      if (ev.type === "message" && ev.conversation_id === id) {
        const msg = ev.message as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // 👇 only auto-scroll if the user is already near the bottom,
        // so it doesn't yank them down mid-scrollback
        if (scrollOffset.current < 150) {
          shouldScrollToBottom.current = true;
        }
      }
    });
    return unsub;
}, [id, subscribe]);

  const initialScrollDone = useRef(false);

useEffect(() => {

    if (
        !loading &&
        messages.length > 0 &&
        !initialScrollDone.current
    ) {

        initialScrollDone.current = true;

        shouldScrollToBottom.current = true;

    }

}, [loading, messages.length]);

  useEffect(() => {

    const show = Keyboard.addListener(
        Platform.OS === "ios"
            ? "keyboardWillShow"
            : "keyboardDidShow",
        (e: KeyboardEvent) => {

            Animated.spring(
                keyboardOffset,
                {
                    toValue: e.endCoordinates.height,
                    damping: 18,
                    stiffness: 200,
                    mass: 0.9,
                    useNativeDriver: false,
                }
            ).start();
            setKeyboardHeight(e.endCoordinates.height);

            requestAnimationFrame(() => {
                listRef.current?.scrollToEnd({
                    animated: true,
                });
            });

        }
    );

    const hide = Keyboard.addListener(
        Platform.OS === "ios"
            ? "keyboardWillHide"
            : "keyboardDidHide",
        () => {

            Animated.timing(
                keyboardOffset,
                {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: false,
                }
            ).start();
            setKeyboardHeight(0);

        }
    );

    return () => {

        show.remove();
        hide.remove();

    };

}, []);

 const submit = async () => {
    if (status.blocked) return;
    if (!text.trim() || sending) return;
    setSending(true);
    const tmp = text.trim();
    setText("");
    try {
      const msg = await api.post<Message>(`/chat/${id}/messages`, { content: tmp });
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      shouldScrollToBottom.current = true;   // 👈 always jump to bottom for your own message
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
        <Pressable onPress={() => router.replace("/(tabs)/messages")} hitSlop={12} testID="back-btn">
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

      
        {status.blocked && (
        <View style={styles.blockBanner} testID="chat-block-banner">
          <Ionicons
            name="ban-outline"
            size={18}
            color={colors.error}
          />

          <Text style={styles.blockBannerText}>
            {status.blocked_by_me
              ? "You blocked this user. Unblock them to continue chatting."
              : "You can't send messages to this user."}
          </Text>
        </View>
      )}<View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <FlatList
            testID="messages-list"
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            onScroll={(e) => {
              console.log(
    "offset:",
    e.nativeEvent.contentOffset.y
);
            scrollOffset.current =
                e.nativeEvent.contentOffset.y;
            }}
            onContentSizeChange={(_, h) => {

                contentHeight.current = h;
                console.log(
    "contentHeight:",
    h
);

                if (shouldScrollToBottom.current) {

                    shouldScrollToBottom.current = false;

                    InteractionManager.runAfterInteractions(() => {

                        listRef.current?.scrollToOffset({
                            offset: 999999,
                            animated: false,
                        });

                    });

                }

            }}
            onMomentumScrollEnd={() => {
                if (
                    scrollOffset.current < 150
                ) {
                    loadOlder();
                }

            }}
            contentContainerStyle={{
                padding: spacing.lg,
                gap: spacing.sm,
                paddingBottom: keyboardHeight + 90,
            }}
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
        </View>

        <Animated.View
    style={[
        styles.inputBar,
        {
            transform: [
                {
                    translateY: Animated.add(
                        Animated.multiply(keyboardOffset, -1),
                        -16
                    ),
                },
            ],
        },
    ]}
>
          <TextInput
            editable={!status.blocked}
            testID="message-input"
            value={text}
            onChangeText={setText}
            placeholder={
              status.blocked
                ? status.blocked_by_me
                  ? "Unblock this user to continue chatting..."
                  : "Messaging unavailable."
                : "Type a message..."
            }
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            
          />
          <Pressable onPress={submit} disabled={status.blocked ||!text.trim() ||sending} style={styles.sendBtn} testID="send-message-btn">
            <Ionicons name="send" size={18} color={text.trim() ? "#FFF" : colors.muted} />
          </Pressable>
        </Animated.View>
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
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,

    padding: spacing.md,

    backgroundColor: colors.surfaceSecondary,

    borderTopWidth: 1,
    borderTopColor: colors.border,

    position: "absolute",

    left: 0,
    right: 0,
    bottom: 0,
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
  blockBanner: {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  marginHorizontal: spacing.lg,
  marginTop: spacing.sm,
  marginBottom: spacing.sm,
  padding: spacing.md,
  borderRadius: radius.md,
  backgroundColor: colors.surfaceSecondary,
  borderWidth: 1,
  borderColor: colors.error,
},

blockBannerText: {
  flex: 1,
  color: colors.error,
  fontSize: font.sm,
  fontWeight: "600",
},
});
