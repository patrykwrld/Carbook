export const VIBES = [
  { value: "praise", label: "Praise", emoji: "✨" },
  { value: "neutral", label: "Neutral", emoji: "💬" },
  { value: "gripe", label: "Gripe", emoji: "😤" },
  { value: "warning", label: "Warning", emoji: "⚠️" },
] as const;

export type Vibe = (typeof VIBES)[number]["value"];

export function isVibe(value: string): value is Vibe {
  return VIBES.some((v) => v.value === value);
}
