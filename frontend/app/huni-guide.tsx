import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, spacing } from "@/src/theme/tokens";
import { TITLE_TABLE } from "@/src/utils/rank";

const XP_ACTIONS: { icon: string; label: string; value: string; note?: string }[] = [
  { icon: "log-in-outline", label: "Daily login", value: "+5 EXP" },
  { icon: "create-outline", label: "Create a post", value: "+15 EXP", note: "+10 bonus on your first post of the day" },
  { icon: "chatbubble-outline", label: "Comment on a post", value: "+8 EXP", note: "Up to 5 comments/day" },
  { icon: "heart-outline", label: "React to posts", value: "+1 EXP", note: "Up to 20 reactions/day" },
  { icon: "gift-outline", label: "Redeem a campaign", value: "Set by partner", note: "Amount decided when admin approves the campaign" },
];

export default function HuniGuide() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Huni Guide</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}><Text style={styles.heroLogo}>hu.</Text></View>
          <Text style={styles.h1}>What is Huni?</Text>
          <Text style={styles.body}>
            Huni is a locality-first community app — the honest answer to &ldquo;what&apos;s happening around here?&rdquo; We started in Buug, Zamboanga Sibugay, and
            we&apos;re expanding town by town. Post moods, ask questions, run pulses — all anonymously with your Huni alias.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>Two currencies, one philosophy</Text>
          <Text style={styles.body}>
            We reward <Text style={styles.bold}>participation</Text>, not popularity. Going viral doesn&apos;t make you Level 50. Showing up does.
          </Text>
          <View style={styles.dualCard}>
            <View style={[styles.currencyBox, { backgroundColor: colors.brand }]}> 
              <Ionicons name="trophy" size={24} color="#FFFFFF" />
              <Text style={styles.currencyTitle}>Community EXP</Text>
              <Text style={styles.currencyBody}>Permanent. Never decreases. Never spent. It only determines your rank & title.</Text>
            </View>
            <View style={[styles.currencyBox, { backgroundColor: colors.onBrandTertiary }]}> 
              <Ionicons name="cash-outline" size={24} color="#FFFFFF" />
              <Text style={styles.currencyTitle}>Huni Tokens</Text>
              <Text style={styles.currencyBody}>Spendable. Earned from partner campaigns. Spent on cosmetics, raffles & events.</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>How to earn EXP</Text>
          {XP_ACTIONS.map((a) => (
            <View key={a.label} style={styles.actionRow}>
              <View style={styles.actionIcon}><Ionicons name={a.icon as never} size={18} color={colors.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionLabel}>{a.label}</Text>
                {!!a.note && <Text style={styles.actionNote}>{a.note}</Text>}
              </View>
              <Text style={styles.actionValue}>{a.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>Levels & Titles</Text>
          <Text style={styles.body}>
            Instead of just “Level 25” we give every rank a name. Titles are memorable — they say who you are in the community.
          </Text>
          <View style={styles.titleTable}>
            {TITLE_TABLE.map((t, idx) => (
              <View key={t.level} style={[styles.titleRow, idx !== 0 && styles.titleRowBorder]}>
                <View style={styles.titlePill}><Text style={styles.titlePillText}>Lv. {t.level}</Text></View>
                <Text style={styles.titleName}>{t.title}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.bodyMuted}>Levels 1-10 have set thresholds. From Level 11 onward, each level takes ~15% more EXP than the last.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>How Tokens work</Text>
          <Text style={styles.body}>
            Businesses — our <Text style={styles.bold}>Partners</Text> — fund campaigns with a total EXP and Token budget agreed with Huni admins. When you scan a partner&apos;s QR (or when they scan yours), the campaign&apos;s per-person allocation is credited to you.
          </Text>
          <Text style={styles.body}>
            When a campaign&apos;s budget runs out, it auto-pauses so it never overspends. Fair to everyone.
          </Text>
          <Pressable style={styles.cta} onPress={() => router.push("/perks")} testID="guide-see-perks">
            <Ionicons name="pricetags-outline" size={18} color="#FFFFFF" />
            <Text style={styles.ctaText}>Browse live perks</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>The Huni Store</Text>
          <Text style={styles.body}>
            Coming soon: spend your Tokens on backgrounds, profile borders, avatar packs, seasonal drops (Christmas, Fiesta, Halloween), raffles, competitions, and legacy collections. Your inventory shows off what you&apos;ve earned.
          </Text>
          <Pressable style={[styles.cta, { backgroundColor: colors.surfaceTertiary }]} onPress={() => router.push("/store")} testID="guide-see-store">
            <Ionicons name="storefront-outline" size={18} color={colors.brand} />
            <Text style={[styles.ctaText, { color: colors.brand }]}>Peek the store</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Made with care in Buug, Zamboanga Sibugay · Honest. Local. Things.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  title: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  hero: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  heroIcon: { width: 60, height: 60, borderRadius: 14, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  heroLogo: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  h1: { fontSize: 24, fontWeight: "900", color: colors.onSurface },
  h2: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface },
  body: { color: colors.onSurface, lineHeight: 22, fontSize: font.base },
  bodyMuted: { color: colors.muted, lineHeight: 20, fontSize: font.sm, marginTop: spacing.xs },
  bold: { fontWeight: "900" },
  section: { gap: spacing.sm },
  dualCard: { gap: spacing.md, marginTop: spacing.xs },
  currencyBox: { borderRadius: radius.md, padding: spacing.md, gap: 4 },
  currencyTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: font.lg },
  currencyBody: { color: "#FFF", opacity: 0.95, lineHeight: 18, fontSize: font.sm },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  actionIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  actionLabel: { color: colors.onSurface, fontWeight: "700" },
  actionNote: { color: colors.muted, fontSize: font.sm },
  actionValue: { color: colors.success, fontWeight: "900" },
  titleTable: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm },
  titleRowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  titlePill: { backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, minWidth: 62, alignItems: "center" },
  titlePillText: { color: colors.onBrandTertiary, fontWeight: "900", fontSize: font.sm },
  titleName: { color: colors.onSurface, fontWeight: "700" },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, paddingVertical: 12, borderRadius: radius.pill, marginTop: spacing.xs },
  ctaText: { color: "#FFFFFF", fontWeight: "800" },
  footer: { paddingVertical: spacing.md, alignItems: "center" },
  footerText: { color: colors.muted, fontSize: font.sm, textAlign: "center" },
});
