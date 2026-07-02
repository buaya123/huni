export const colors = {
  surface: "#FBF9F6",
  onSurface: "#2A2826",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#2A2826",
  surfaceTertiary: "#F2EFEA",
  onSurfaceTertiary: "#4A4744",
  surfaceInverse: "#2A2826",
  onSurfaceInverse: "#FBF9F6",
  brand: "#F06543",
  brandPrimary: "#F06543",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FF8C70",
  brandTertiary: "#FCE8E3",
  onBrandTertiary: "#D44C2B",
  success: "#3A824A",
  warning: "#D99318",
  error: "#D43B3B",
  info: "#4A4744",
  border: "#E8E4DF",
  borderStrong: "#D1CAC2",
  divider: "#F2EFEA",
  muted: "#8A8582",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const font = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 30,
} as const;

export const shadow = {
  card: {
    shadowColor: "#2A2826",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const MOODS = [
  { key: "need_advice", label: "Need Advice", emoji: "💭" },
  { key: "confession", label: "Confession", emoji: "🤐" },
  { key: "rant", label: "Rant", emoji: "😤" },
  { key: "question", label: "Question", emoji: "❓" },
  { key: "local_update", label: "Local Update", emoji: "📍" },
  { key: "hot_take", label: "Hot Take", emoji: "🔥" },
  { key: "buy_sell", label: "Buy / Sell", emoji: "🛒" },
  { key: "safety", label: "Safety", emoji: "⚠️" },
  { key: "pulse", label: "Pulse", emoji: "📊" },
] as const;

export const REACTIONS = [
  { key: "heart", label: "❤️" },
  { key: "helpful", label: "🙌" },
  { key: "hug", label: "🤗" },
  { key: "laugh", label: "😂" },
] as const;

export type MoodKey = (typeof MOODS)[number]["key"];
export type ReactionKey = (typeof REACTIONS)[number]["key"];

export function moodMeta(key: string) {
  return MOODS.find((m) => m.key === key) ?? { key, label: key, emoji: "•" };
}

// Deterministic color from alias for avatars
export function aliasColor(alias: string): string {
  const palette = ["#F06543", "#3A824A", "#D99318", "#4A6EE0", "#9B59B6", "#E67E22", "#16A085", "#C0392B"];
  let hash = 0;
  for (let i = 0; i < alias.length; i++) hash = (hash * 31 + alias.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function aliasInitials(alias: string): string {
  const cleaned = alias.replace(/[0-9]/g, "");
  const parts = cleaned.match(/[A-Z][a-z]*/g) ?? [cleaned];
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}
