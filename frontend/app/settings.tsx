import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { UserRepository } from "@/src/repositories/UserRepository";
import { useAuth } from "@/src/context/auth";
import { Avatar } from "@/src/components/Avatar";
import { DeleteAccountModal } from "@/src/components/DeleteAccountModal";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

import type { BlockRow } from "@/src/types/user";

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await UserRepository.getBlockedUsers();
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
      await UserRepository.unblock(targetId);
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
          <Text style={styles.sectionTitle}>Rewards</Text>
          <Pressable style={styles.navRow} onPress={() => router.push("/rewards")} testID="rewards-btn">
            <Ionicons name="trophy-outline" size={18} color={colors.brand} />
            <Text style={styles.navLabel}>My rewards, EXP & tokens</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          <Pressable style={styles.navRow} onPress={() => router.push("/perks")} testID="perks-btn">
            <Ionicons name="pricetags-outline" size={18} color={colors.brand} />
            <Text style={styles.navLabel}>Browse local perks</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          <Pressable style={styles.navRow} onPress={() => router.push("/store")} testID="store-btn">
            <Ionicons name="storefront-outline" size={18} color={colors.brand} />
            <Text style={styles.navLabel}>Huni Store</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          <Pressable style={styles.navRow} onPress={() => router.push("/qr")} testID="my-qr-btn">
            <Ionicons name="qr-code-outline" size={18} color={colors.brand} />
            <Text style={styles.navLabel}>My QR code</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          <Pressable style={styles.navRow} onPress={() => router.push("/huni-guide")} testID="guide-btn">
            <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
            <Text style={styles.navLabel}>How Huni works</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        </View>

        {(user?.role === "partner" || user?.role === "admin") && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Partner</Text>
            <Pressable style={styles.navRow} onPress={() => router.push("/partner")} testID="partner-hub-btn">
              <Ionicons name="business-outline" size={18} color={colors.brand} />
              <Text style={styles.navLabel}>Partner Hub</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
            <Pressable style={styles.navRow} onPress={() => router.push("/partner/scan")} testID="partner-scan-shortcut">
              <Ionicons name="qr-code-outline" size={18} color={colors.brand} />
              <Text style={styles.navLabel}>Scan a user QR</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          </View>
        )}

        {(user?.role === "advertiser" || user?.role === "admin") && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monetization</Text>
            <Pressable style={styles.navRow} onPress={() => router.push("/ads")} testID="ad-manager-btn">
              <Ionicons name="megaphone-outline" size={18} color={colors.brand} />
              <Text style={styles.navLabel}>Ad Manager</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
            {user?.role === "admin" && (
              <>
                <Pressable style={styles.navRow} onPress={() => router.push("/admin")} testID="admin-panel-btn">
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.brand} />
                  <Text style={styles.navLabel}>Admin Panel</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
                <Pressable style={styles.navRow} onPress={() => router.push("/admin/store")} testID="admin-store-btn">
                  <Ionicons name="storefront-outline" size={18} color={colors.brand} />
                  <Text style={styles.navLabel}>Store Manager</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              </>
            )}
          </View>
        )}

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

        {/*
          Danger zone — deliberately hidden behind an explicit toggle so users
          can't hit "Delete account" by accident. Long-press OR tap the reveal
          row to expand.
        */}
        <View style={styles.dangerSection}>
          <Pressable
            onPress={() => setDangerOpen((v) => !v)}
            onLongPress={() => setDangerOpen(true)}
            delayLongPress={600}
            style={styles.dangerToggle}
            testID="danger-zone-toggle"
            accessibilityRole="button"
            accessibilityLabel={dangerOpen ? "Hide danger zone" : "Show danger zone"}
            hitSlop={8}
          >
            <Ionicons
              name={dangerOpen ? "chevron-down-outline" : "chevron-forward-outline"}
              size={14}
              color={colors.muted}
            />
            <Text style={styles.dangerToggleText}>
              {dangerOpen ? "Hide danger zone" : "Show danger zone"}
            </Text>
          </Pressable>

          {dangerOpen && (
            <View style={styles.dangerBody} testID="danger-zone-body">
              <View style={styles.dangerHeader}>
                <Ionicons name="warning-outline" size={16} color={colors.error} />
                <Text style={styles.dangerHeaderText}>Danger zone</Text>
              </View>
              <Text style={styles.dangerCopy}>
                Deleting your account is permanent. Your posts, comments, images,
                bookmarks and rewards balance will be removed.
              </Text>
              <Pressable
                style={styles.deleteBtn}
                onPress={() => setDeleteModalOpen(true)}
                testID="settings-delete-account-btn"
                accessibilityLabel="Delete my account"
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={styles.deleteBtnText}>Delete my account</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={styles.footer}>Huni · Whisper honestly · Buug, Zamboanga Sibugay</Text>
      </ScrollView>

      <DeleteAccountModal
        visible={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
      />
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
  navRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10, minHeight: 44 },
  navLabel: { flex: 1, color: colors.onSurface, fontWeight: "600", fontSize: font.base },
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
  dangerSection: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  dangerToggle: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  dangerToggleText: {
    color: colors.muted,
    fontSize: font.sm,
    fontWeight: "600",
  },
  dangerBody: {
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: "rgba(239,68,68,0.04)",
    gap: spacing.sm,
  },
  dangerHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  dangerHeaderText: {
    color: colors.error,
    fontWeight: "800",
    fontSize: font.base,
    letterSpacing: 0.3,
  },
  dangerCopy: {
    color: colors.onSurfaceTertiary,
    fontSize: font.sm,
    lineHeight: 20,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: "transparent",
    minHeight: 44,
  },
  deleteBtnText: {
    color: colors.error,
    fontWeight: "800",
    fontSize: font.base,
  },
  footer: { textAlign: "center", color: colors.muted, fontSize: font.sm, marginTop: spacing.lg },
});
