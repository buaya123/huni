import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewToken,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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

type ChatRow =
    | {
          type: "day";
          id: string;
          label: string;
      }
    | {
          type: "message";
          id: string;
          message: Message;
      };

type ConversationStatus = {
  blocked: boolean;
  blocked_by_me: boolean;
  blocked_by_other: boolean;
};

function formatTime(date: string) {

    const d = new Date(date);

    return d.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });

}

function formatDay(date: string) {

    const d = new Date(date);

    const today = new Date();

    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString())
        return "Today";

    if (d.toDateString() === yesterday.toDateString())
        return "Yesterday";

    return d.toLocaleDateString([], {
        month: "long",
        day: "numeric",
        year:
            d.getFullYear() !== today.getFullYear()
                ? "numeric"
                : undefined,
    });

}

function buildRows(messages: Message[]): ChatRow[] {

    const rows: ChatRow[] = [];

    let previousDay: string | null = null;

    for (const message of messages) {

        const currentDay =
            new Date(message.created_at).toDateString();

        if (currentDay !== previousDay) {

            rows.push({
                type: "day",
                id: `day-${currentDay}`,
                label: formatDay(message.created_at),
            });

            previousDay = currentDay;

        }

        rows.push({
            type: "message",
            id: message.id,
            message,
        });

    }

    return rows;

}

export default function ChatDetail() {
  const { id, alias, userId } = useLocalSearchParams<{ id: string; alias?: string; userId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { subscribe } = useWS();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [rows, setRows] = useState<ChatRow[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setRows(buildRows(messages));
}, [messages]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<ConversationStatus>({
    blocked: false,
    blocked_by_me: false,
    blocked_by_other: false,
  });
  const [showActions, setShowActions] = useState(false);
  const listRef = useRef<FlatList<ChatRow>>(null);
  const initialScrollDone = useRef(false);
  const flatListHeight = useRef(0);
  const previousFlatListHeight = useRef(0);

  const contentHeight = useRef(0);
  const scrollOffset = useRef(0);

const onViewableItemsChanged = useRef(
    ({
        viewableItems,
    }: {
        viewableItems: ViewToken[];
    }) => {

        let lastId: string | null = null;

        for (const token of viewableItems) {

            const row = token.item as ChatRow;

            if (row.type === "message") {
                lastId = row.id;
            }

        }

        lastVisibleMessageId.current = lastId;

    }
).current;

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 90,
};
const lastVisibleMessageId =
    useRef<string | null>(null);
  
  const PAGE_SIZE = 30;

  const [offset, setOffset] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);

  const previousHeight = useRef(0);

  const userDragging = useRef(false);
  const isNearBottom = useRef(true);

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

        console.log("ROWS:", rows.length);

        rows.forEach((m, i) => {
            console.log(
                i,
                m.created_at,
                m.content
            );
        });

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

        const rows = await api.get<Message[]>(
            `/chat/${id}/messages?offset=${offset}&limit=${PAGE_SIZE}`
        );

        if (rows.length === 0) {

            setHasOlder(false);
            return;

        }

        setMessages(prev => {
            const existing = new Set(prev.map(m => m.id));

            const older = rows.filter(m => !existing.has(m.id));

            return [...older, ...prev];
        });

        setOffset(prev => prev + rows.length);

        if (rows.length < PAGE_SIZE)
            setHasOlder(false);

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
                if (prev.some((m) => m.id === msg.id))
                    return prev;

                return [...prev, msg];
            });
            if (isNearBottom.current) {
                scrollToLatest();
            }
        }
    });

    return unsub;
}, [id, subscribe, isNearBottom]);

// Scroll to bottom when keyboard opens so the newest message stays visible above the input bar.
useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => {
        setKeyboardVisible(true);
        // Small delay lets KAV finish resizing before we scroll.
        requestAnimationFrame(() => {
            listRef.current?.scrollToEnd({ animated: true });
        });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
        setKeyboardVisible(false);
    });
    return () => {
        showSub.remove();
        hideSub.remove();
    };
}, []);


const scrollToLatest = (animated = false) => {

    requestAnimationFrame(() => {

        if (isNearBottom.current) {
            requestAnimationFrame(() => {
                listRef.current?.scrollToEnd({
                    animated: true,
                });
            });
        }

    });

};




 const submit = async () => {
    if (status.blocked) return;
    if (!text.trim() || sending) return;
    setSending(true);
    const tmp = text.trim();
    setText("");
    try {
          const msg = await api.post<Message>(
        `/chat/${id}/messages`,
        { content: tmp }
    );

    setMessages(prev => {
    const next = prev.some(m => m.id === msg.id)
        ? prev
        : [...prev, msg];



    return next;
});

    scrollToLatest();
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
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
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
      )}
      
    <View style={{ flex: 1 }} 
    onLayout={(e) => {
                const newHeight = e.nativeEvent.layout.height;

                console.log("FlatList height:", newHeight);

                if (
                    previousHeight.current &&
                    newHeight < previousHeight.current &&
                    isNearBottom.current
                ) {
                    requestAnimationFrame(() => {
                        listRef.current?.scrollToEnd({
                            animated: false,
                        });
                    });
                }

                previousHeight.current = newHeight;
            }}
    >

    
    {loading ? (
        <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
        </View>
    ) : (
    <>

        <FlatList
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            
            testID="messages-list"
            ref={listRef}
            data={rows}
            keyExtractor={(row) => row.id}
            onScrollBeginDrag={() => {
                userDragging.current = true;
            }}
            onMomentumScrollEnd={(e) => {
                userDragging.current = false;
            }}
            onContentSizeChange={(_, h) => {
                contentHeight.current = h;
            }}
            onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;

                const distanceFromBottom =
                    contentSize.height -
                    (contentOffset.y + layoutMeasurement.height);

                isNearBottom.current = distanceFromBottom < 80;
            }}
            scrollEventThrottle={16}
            contentContainerStyle={{
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.lg,
                paddingBottom: 12,
            }}
            ListEmptyComponent={
                <Text style={styles.emptyText}>
                    Say hi anonymously.
                </Text>
            }
            ListFooterComponent={
                loadingOlder ? (
                    <ActivityIndicator
                        color={colors.brand}
                        style={{ marginVertical: spacing.md }}
                    />
                ) : null
            }
            renderItem={({ item: row, index }) => {

                if (row.type === "day") {

                    return (
                        <View style={styles.dayDivider}>
                            <View style={styles.dayLine} />

                            <Text style={styles.dayText}>
                                {row.label}
                            </Text>

                            <View style={styles.dayLine} />
                        </View>
                    );

                }

                const item = row.message;


                const mine =
                    item.sender_id === user?.id;

                return (
                    <>


                        <View
                            onLayout={() => {

                                if (
                                    !initialScrollDone.current &&
                                    index === rows.length - 1
                                ) {

                                    initialScrollDone.current = true;

                                    requestAnimationFrame(() => {
                                        scrollToLatest(false);
                                    });

                                }

                            }}
                            style={[
                                styles.bubbleRow,
                                mine
                                    ? styles.mineRow
                                    : styles.otherRow,
                            ]}
                        >
                            <View
                                style={[
                                    styles.bubble,
                                    mine
                                        ? styles.mine
                                        : styles.other,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.bubbleText,
                                        mine && {
                                            color: "#FFF",
                                        },
                                    ]}
                                >
                                    {item.content}
                                </Text>

                                <Text
                                    style={[
                                        styles.timeText,
                                        mine &&
                                            styles.timeMine,
                                    ]}
                                >
                                    {formatTime(item.created_at)}
                                </Text>
                            </View>
                        </View>

                    </>
                );
            }
        }
        />
    </>
    )}
</View>


            <View style={[styles.inputBar, { paddingBottom: keyboardVisible ? spacing.sm : spacing.md + insets.bottom }]}>
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
  bubbleRow: {
    flexDirection: "row",
    marginVertical: 3,
},
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
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

timeText: {
    marginTop: 4,
    alignSelf: "flex-end",
    fontSize: 11,
    color: colors.muted,
},

timeMine: {
    color: "rgba(255,255,255,0.75)",
},
dayDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.lg,
},

dayLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
},

dayText: {
    marginHorizontal: spacing.md,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
},

});
