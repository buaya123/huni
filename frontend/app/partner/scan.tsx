import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import { Avatar } from "@/src/components/Avatar";

type Campaign = {
  id: string;
  title: string;
  description: string;
  exp_per_redemption: number;
  tokens_per_redemption: number;
  discount_label: string;
  already_redeemed: boolean;
};

type ScanResult = {
  user: { id: string; alias: string; exp?: number; tokens?: number; points?: number };
  campaigns: Campaign[];
};

export default function PartnerScan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    if (!permission || permission.granted) return;
    if (permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const doScan = async (code: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post<ScanResult>("/partner/scan", { code });
      setResult(r);
    } catch (e) {
      Alert.alert("Scan failed", e instanceof Error ? e.message : "Unknown error");
      scannedRef.current = false; // allow retry
    } finally {
      setBusy(false);
    }
  };

  const onBarCode = ({ data }: { data: string }) => {
    if (scannedRef.current || busy) return;
    scannedRef.current = true;
    doScan(data);
  };

  const rescan = () => {
    scannedRef.current = false;
    setResult(null);
  };

  const doRedeem = async (c: Campaign) => {
    if (!result || redeeming) return;
    setRedeeming(c.id);
    try {
      await api.post("/partner/redeem", { campaign_id: c.id, user_id: result.user.id });
      Alert.alert(
        "Redeemed",
        `${c.title} applied to ${result.user.alias}.`,
        [{ text: "Scan another", onPress: rescan }],
      );
    } catch (e) {
      Alert.alert("Could not redeem", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRedeeming(null);
    }
  };

  const submitManual = () => {
    if (!manualCode.trim()) return;
    setManualOpen(false);
    doScan(manualCode.trim());
    setManualCode("");
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Scan user QR</Text>
        <Pressable onPress={() => setManualOpen(true)} hitSlop={12} testID="manual-entry">
          <Ionicons name="keypad-outline" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {!result ? (
        <View style={styles.camWrap}>
          {!permission ? (
            <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
          ) : !permission.granted ? (
            <View style={styles.center}>
              <Ionicons name="camera-outline" size={48} color={colors.muted} />
              <Text style={styles.h1}>Camera access needed</Text>
              <Text style={styles.hint}>We use your camera only to scan Huni QR codes.</Text>
              <Pressable style={styles.primaryBtn} onPress={requestPermission}>
                <Text style={styles.primaryText}>Grant camera access</Text>
              </Pressable>
              <Pressable style={styles.linkBtn} onPress={() => setManualOpen(true)}>
                <Text style={styles.linkText}>Enter code manually</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={onBarCode}
              />
              <View style={styles.overlay} pointerEvents="none">
                <View style={styles.reticle} />
                <Text style={styles.overlayText}>
                  {busy ? "Reading…" : "Point at a Huni profile QR"}
                </Text>
              </View>
              <Pressable style={styles.manualPill} onPress={() => setManualOpen(true)}>
                <Ionicons name="keypad-outline" size={16} color="#FFFFFF" />
                <Text style={styles.manualPillText}>Manual code</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
          <View style={styles.userCard}>
            <Avatar alias={result.user.alias} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.userAlias}>{result.user.alias}</Text>
              <Text style={styles.userSub}>Lv. {Math.floor((result.user.exp ?? result.user.points ?? 0) / 100) + 1} · {(result.user.exp ?? result.user.points ?? 0).toLocaleString()} EXP · {(result.user.tokens ?? 0).toLocaleString()} tokens</Text>
            </View>
            <Pressable onPress={rescan} testID="rescan-btn"><Ionicons name="close-circle" size={26} color={colors.muted} /></Pressable>
          </View>

          <Text style={styles.sectionTitle}>Apply a campaign</Text>
          {result.campaigns.length === 0 && (
            <View style={styles.emptyBox}>
              <Ionicons name="alert-circle-outline" size={22} color={colors.muted} />
              <Text style={styles.hint}>No live campaigns. Approve one first, or create a new one.</Text>
            </View>
          )}
          {result.campaigns.map((c) => (
            <View key={c.id} style={styles.campaignCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cTitle}>{c.title}</Text>
                <Text style={styles.cDesc} numberOfLines={2}>{c.description}</Text>
                <Text style={styles.cReward}>
                  {c.exp_per_redemption > 0 && `+${c.exp_per_redemption} EXP`}
                  {c.exp_per_redemption > 0 && (c.tokens_per_redemption > 0 || !!c.discount_label) && "  •  "}
                  {c.tokens_per_redemption > 0 && `+${c.tokens_per_redemption} tokens`}
                  {c.tokens_per_redemption > 0 && !!c.discount_label && "  •  "}
                  {c.discount_label}
                </Text>
              </View>
              {c.already_redeemed ? (
                <View style={[styles.claimBtn, styles.claimedBtn]}>
                  <Ionicons name="checkmark" size={16} color={colors.muted} />
                  <Text style={styles.claimedText}>Claimed</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.claimBtn}
                  onPress={() => doRedeem(c)}
                  disabled={redeeming === c.id}
                  testID={`redeem-${c.id}`}
                >
                  {redeeming === c.id ? <ActivityIndicator color="#FFFFFF" /> : (
                    <>
                      <Ionicons name="gift" size={16} color="#FFFFFF" />
                      <Text style={styles.claimText}>Apply</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal transparent visible={manualOpen} animationType="fade" onRequestClose={() => setManualOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter code manually</Text>
            <Text style={styles.hint}>Paste the QR text (e.g. huni:user:...)</Text>
            <TextInput
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="huni:user:..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              testID="manual-code-input"
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable style={[styles.mBtn, styles.ghostBtn]} onPress={() => setManualOpen(false)}>
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.mBtn} onPress={submitManual} testID="manual-submit">
                <Text style={styles.mText}>Scan</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0B0B0B" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, backgroundColor: colors.surface },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  camWrap: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface },
  h1: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  hint: { color: colors.muted, textAlign: "center", fontSize: font.sm, maxWidth: 280 },
  primaryBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: radius.pill },
  primaryText: { color: "#FFFFFF", fontWeight: "800" },
  linkBtn: { padding: spacing.sm },
  linkText: { color: colors.brand, fontWeight: "700" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.md },
  reticle: {
    width: 240, height: 240, borderRadius: radius.md,
    borderWidth: 3, borderColor: "#FFFFFF", opacity: 0.9,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  overlayText: { color: "#FFFFFF", fontWeight: "700", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  manualPill: { position: "absolute", bottom: 30, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill },
  manualPillText: { color: "#FFFFFF", fontWeight: "700" },

  userCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  userAlias: { fontSize: font.lg, fontWeight: "900", color: colors.onSurface },
  userSub: { color: colors.muted, fontSize: font.sm },
  sectionTitle: { color: colors.onSurface, fontWeight: "800", fontSize: font.base },
  emptyBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  campaignCard: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cTitle: { fontWeight: "800", color: colors.onSurface },
  cDesc: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: 2 },
  cReward: { color: colors.onBrandTertiary, fontWeight: "700", marginTop: 6, fontSize: font.sm },
  claimBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, minWidth: 84, justifyContent: "center" },
  claimedBtn: { backgroundColor: colors.surfaceTertiary },
  claimText: { color: "#FFFFFF", fontWeight: "800" },
  claimedText: { color: colors.muted, fontWeight: "700" },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontWeight: "800", fontSize: font.lg, color: colors.onSurface },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface },
  mBtn: { flex: 1, backgroundColor: colors.brand, paddingVertical: 12, borderRadius: radius.pill, alignItems: "center" },
  mText: { color: "#FFFFFF", fontWeight: "800" },
  ghostBtn: { backgroundColor: colors.surfaceTertiary },
  ghostText: { color: colors.onSurface, fontWeight: "800" },
});
