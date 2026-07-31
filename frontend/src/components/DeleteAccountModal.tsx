import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/context/auth";
import { ApiError } from "@/src/api/client";
import { colors, font, radius, spacing } from "@/src/theme/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Deliberately-hard-to-fat-finger account deletion dialog.
 *
 * Requires:
 *  • Typing the exact word "DELETE" (case-sensitive)
 *  • Current password for email/password accounts (Google-linked accounts skip this)
 *  • A final tap on a clearly-marked destructive button
 *
 * The primary action stays disabled until every guard is satisfied.
 */
export function DeleteAccountModal({ visible, onClose }: Props) {
  const { user, deleteAccount } = useAuth();
  const isPasswordAuth = (user?.auth_provider ?? "password") === "password";

  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (confirmText !== "DELETE") return false;
    if (isPasswordAuth && password.length < 1) return false;
    return true;
  }, [confirmText, isPasswordAuth, password, submitting]);

  const reset = () => {
    setConfirmText("");
    setPassword("");
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleDelete = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await deleteAccount({
        confirmation: confirmText,
        password: isPasswordAuth ? password : undefined,
      });
      // Success — auth context replaces the route to /welcome.
    } catch (e) {
      let msg = "Something went wrong. Please try again.";
      if (e instanceof ApiError) msg = e.message || msg;
      else if (e instanceof Error) msg = e.message || msg;
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card} testID="delete-account-modal">
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg }}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="warning" size={28} color={colors.error} />
            </View>
            <Text style={styles.title}>Delete your account?</Text>
            <Text style={styles.subtitle}>
              This is permanent. We cannot undo it.
            </Text>

            <View style={styles.bulletList}>
              <Bullet text="Your posts and comments will be removed." />
              <Bullet text="Your images, bookmarks and messages will be deleted." />
              <Bullet text="Your EXP and tokens will be forfeited." />
              <Bullet text="You'll be signed out on all devices." />
            </View>

            <Text style={styles.fieldLabel}>
              Type <Text style={styles.mono}>DELETE</Text> to confirm
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCorrect={false}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="DELETE"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="delete-confirm-input"
            />

            {isPasswordAuth && (
              <>
                <Text style={styles.fieldLabel}>Enter your password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  autoCorrect={false}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  secureTextEntry
                  placeholder="Current password"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  testID="delete-password-input"
                />
              </>
            )}

            {!!error && (
              <Text style={styles.errorText} testID="delete-error">
                {error}
              </Text>
            )}

            <View style={styles.actions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={handleClose}
                disabled={submitting}
                testID="delete-cancel-btn"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.deleteBtn,
                  !canSubmit && styles.deleteBtnDisabled,
                ]}
                onPress={handleDelete}
                disabled={!canSubmit}
                testID="delete-confirm-btn"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color="#FFF" />
                    <Text style={styles.deleteText}>Delete forever</Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: spacing.md,
  },
  card: {
    maxHeight: "92%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  iconWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: font.lg,
    fontWeight: "800",
    color: colors.onSurface,
    textAlign: "center",
  },
  subtitle: {
    fontSize: font.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: spacing.md,
  },
  bulletList: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
    marginBottom: spacing.md,
  },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.error,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    color: colors.onSurfaceTertiary,
    fontSize: font.sm,
    lineHeight: 20,
  },
  fieldLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: font.sm,
    marginBottom: 6,
    marginTop: spacing.sm,
  },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontWeight: "800",
    color: colors.error,
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    fontSize: font.base,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 44,
  },
  errorText: {
    color: colors.error,
    fontSize: font.sm,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    color: colors.onSurface,
    fontWeight: "700",
    fontSize: font.base,
  },
  deleteBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
  },
  deleteBtnDisabled: {
    opacity: 0.4,
  },
  deleteText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: font.base,
  },
});
