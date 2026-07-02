import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { api } from "@/src/api/client";
import { colors, font, MOODS, radius, spacing } from "@/src/theme/tokens";

export default function CreatePost() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string>("question");
  const [audience, setAudience] = useState<"public" | "nearby">("public");
  const [pulseOpts, setPulseOpts] = useState<string[]>(["", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPulse = mood === "pulse";
  const TITLE_MAX = 100;

  const submit = async () => {
    if (!title.trim()) {
      setError("Please add a title.");
      return;
    }
    if (!content.trim()) {
      setError("Please write something.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        content: content.trim(),
        mood,
        audience,
      };
      if (isPulse) {
        const opts = pulseOpts.map((o) => o.trim()).filter(Boolean);
        if (opts.length < 2) {
          setError("Pulse needs at least 2 options.");
          setLoading(false);
          return;
        }
        body.pulse_options = opts;
      }
      const post = await api.post<{ id: string }>("/posts", body);
      setTitle("");
      setContent("");
      setPulseOpts(["", ""]);
      router.replace(`/post/${post.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to post");
    } finally {
      setLoading(false);
    }
  };

  const setPulseOpt = (idx: number, val: string) => {
    setPulseOpts((prev) => prev.map((p, i) => (i === idx ? val : p)));
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>New post</Text>
        <Text style={styles.sub}>Anonymous, respectful, and safe.</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Mood</Text>
          <View style={styles.moodGrid}>
            {MOODS.map((m) => {
              const active = m.key === mood;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setMood(m.key)}
                  style={[styles.moodChip, active && styles.moodChipActive]}
                  testID={`mood-select-${m.key}`}
                >
                  <Text style={styles.moodEmoji}>{m.emoji}</Text>
                  <Text style={[styles.moodLabel, active && styles.moodLabelActive]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Audience</Text>
          <View style={styles.row}>
            {(["public", "nearby"] as const).map((a) => (
              <Pressable
                key={a}
                onPress={() => setAudience(a)}
                style={[styles.audChip, audience === a && styles.audChipActive]}
                testID={`audience-${a}`}
              >
                <Ionicons
                  name={a === "public" ? "globe-outline" : "location-outline"}
                  size={16}
                  color={audience === a ? "#FFF" : colors.onSurfaceTertiary}
                />
                <Text style={[styles.audText, audience === a && { color: "#FFF" }]}>
                  {a === "public" ? "Public" : "Nearby only"}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{`What's on your mind?`}</Text>
          <View style={styles.titleRow}>
            <TextInput
              testID="post-title-input"
              value={title}
              onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
              placeholder="Give it a short title..."
              placeholderTextColor={colors.muted}
              style={styles.titleInput}
              maxLength={TITLE_MAX}
            />
            <Text style={styles.charCount} testID="title-char-count">{title.length}/{TITLE_MAX}</Text>
          </View>
          <TextInput
            testID="post-content-input"
            value={content}
            onChangeText={setContent}
            placeholder="Share honestly. Respect others."
            placeholderTextColor={colors.muted}
            multiline
            style={styles.textarea}
          />

          {isPulse && (
            <View>
              <Text style={styles.label}>Pulse options (2-4)</Text>
              {pulseOpts.map((opt, idx) => (
                <TextInput
                  key={idx}
                  testID={`pulse-option-input-${idx}`}
                  value={opt}
                  onChangeText={(v) => setPulseOpt(idx, v)}
                  placeholder={`Option ${idx + 1}`}
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              ))}
              {pulseOpts.length < 4 && (
                <Pressable onPress={() => setPulseOpts([...pulseOpts, ""])} style={styles.addOptBtn} testID="add-pulse-opt">
                  <Ionicons name="add" size={16} color={colors.brand} />
                  <Text style={styles.addOptText}>Add option</Text>
                </Pressable>
              )}
            </View>
          )}

          <View style={styles.notice}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.info} />
            <Text style={styles.noticeText}>
              {`Never share your real name, address, phone, or others' private info. Threats and harassment are removed.`}
            </Text>
          </View>

          {error && <Text style={styles.error} testID="post-error">{error}</Text>}

          <Pressable
            testID="post-submit-btn"
            onPress={submit}
            disabled={loading}
            style={[styles.btn, loading && { opacity: 0.6 }]}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Post anonymously</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg },
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  sub: { color: colors.muted, marginTop: 2 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  label: { fontSize: font.sm, fontWeight: "700", color: colors.onSurfaceTertiary, marginTop: spacing.sm },
  moodGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    gap: 6,
  },
  moodChipActive: { backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand },
  moodEmoji: { fontSize: 14 },
  moodLabel: { fontSize: font.sm, fontWeight: "600", color: colors.onSurfaceTertiary },
  moodLabelActive: { color: colors.onBrandTertiary },
  row: { flexDirection: "row", gap: spacing.sm },
  audChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    gap: 6,
  },
  audChipActive: { backgroundColor: colors.brand },
  audText: { fontSize: font.base, color: colors.onSurfaceTertiary, fontWeight: "600" },
  titleRow: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  titleInput: {
    fontSize: font.lg,
    fontWeight: "700",
    color: colors.onSurface,
    paddingVertical: spacing.sm,
  },
  charCount: {
    alignSelf: "flex-end",
    fontSize: 11,
    color: colors.muted,
    paddingBottom: 4,
  },
  textarea: {
    minHeight: 140,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.lg,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: "top",
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.base,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  addOptBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", padding: spacing.sm },
  addOptText: { color: colors.brand, fontWeight: "600" },
  notice: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
  },
  noticeText: { flex: 1, fontSize: font.sm, color: colors.onSurfaceTertiary, lineHeight: 18 },
  btn: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    marginTop: spacing.md,
  },
  btnText: { color: "#FFF", fontSize: font.lg, fontWeight: "700" },
  error: { color: colors.error, fontSize: font.base, textAlign: "center" },
});
