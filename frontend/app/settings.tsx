import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { Avatar } from "@/src/components/Avatar";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type BlockRow = {
  id: string;
  user: { id: string; alias: string };
  created_at: string;
};

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<BlockRow[]>("/block");
      setBlocks(rows);
    } catch {
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unblock = async (targetId: string) => {
    try {
      await api.del(`/block/${targetId}`);
      setBlocks((prev) => prev.filter((b) => b.user.id !== targetId));
    } catch {
      // ignore
    }
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.replace("/(tabs)/profile")} hitSlop={12} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Row icon="person-circle-outline" label="Alias" value={user?.alias ?? ""} testID="acct-alias" />
          <Row icon="mail-outline" label="Helpful score" value={String(user?.helpful_score ?? 0)} testID="acct-helpful" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety & privacy</Text>
          <InfoRow icon="lock-closed-outline" label="Your posts appear only under your alias." />
          <InfoRow icon="location-outline" label="Precise location is never shared. 'Nearby' is fuzzy." />
          <InfoRow icon="hand-left-outline" label="Report or block anyone. Reports are private." />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Blocked users</Text>
            {loading && <ActivityIndicator color={colors.brand} size="small" />}
          </View>
          {!loading && blocks.length === 0 && (
            <Text style={styles.emptyText}>{`You haven't blocked anyone.`}</Text>
          )}
          {blocks.map((b) => (
            <View key={b.id} style={styles.blockRow} testID={`blocked-${b.user.id}`}>
              <Avatar alias={b.user.alias} size={36} />
              <Text style={styles.blockAlias}>{b.user.alias}</Text>
              <Pressable style={styles.unblockBtn} onPress={() => unblock(b.user.id)} testID={`unblock-${b.user.id}`}>
                <Text style={styles.unblockText}>Unblock</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable style={styles.logoutBtn} onPress={signOut} testID="settings-logout-btn">
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>

        <Text style={styles.footer}>Huni · Whisper honestly · Buug, Zamboanga Sibugay</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, value, testID }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <Ionicons name={icon} size={18} color={colors.onSurfaceTertiary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}
function InfoRow({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.brand} />
      <Text style={styles.rowInfo}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  section: { padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, gap: spacing.sm },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: font.base, fontWeight: "700", color: colors.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  rowLabel: { color: colors.onSurfaceTertiary, flex: 1 },
  rowValue: { color: colors.onSurface, fontWeight: "700" },
  rowInfo: { color: colors.onSurfaceTertiary, flex: 1, fontSize: font.sm, lineHeight: 18 },
  blockRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  blockAlias: { flex: 1, color: colors.onSurface, fontWeight: "600" },
  unblockBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  unblockText: { color: colors.onSurface, fontWeight: "700", fontSize: font.sm },
  emptyText: { color: colors.muted, fontSize: font.sm },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    marginTop: spacing.md,
  },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: font.base },
  footer: { textAlign: "center", color: colors.muted, fontSize: font.sm, marginTop: spacing.lg },
});
