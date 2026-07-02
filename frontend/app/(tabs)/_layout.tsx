import React, { useCallback, useEffect, useState } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/src/context/auth";
import { useWS } from "@/src/context/ws";
import { api } from "@/src/api/client";
import { colors } from "@/src/theme/tokens";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge} testID="tab-badge">
      <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { subscribe } = useWS();
  const router = useRouter();
  const [notifCount, setNotifCount] = useState(0);
  const [msgUnread, setMsgUnread] = useState(0);

  const refreshCounts = useCallback(async () => {
    try {
      const n = await api.get<{ count: number }>("/notifications/unread-count");
      setNotifCount(n.count);
      const convs = await api.get<{ unread: number }[]>("/chat/conversations");
      setMsgUnread(convs.reduce((sum, c) => sum + (c.unread || 0), 0));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshCounts();
    const unsub = subscribe(() => {
      refreshCounts();
    });
    const interval = setInterval(refreshCounts, 15000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [user, refreshCounts, subscribe]);

  useEffect(() => {
    if (!loading && !user) router.replace("/welcome");
  }, [loading, user, router]);

  if (!user) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
          tabBarTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, focused }) => (
            <View>
              <Ionicons name={focused ? "notifications" : "notifications-outline"} size={22} color={color} />
              <Badge count={notifCount} />
            </View>
          ),
          tabBarTestID: "tab-notifications",
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "add-circle" : "add-circle-outline"} size={26} color={color} />
          ),
          tabBarTestID: "tab-create",
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, focused }) => (
            <View>
              <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={22} color={color} />
              <Badge count={msgUnread} />
            </View>
          ),
          tabBarTestID: "tab-messages",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
          ),
          tabBarTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    backgroundColor: colors.brand,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
});
