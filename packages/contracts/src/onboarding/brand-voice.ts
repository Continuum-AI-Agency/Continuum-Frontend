import { z } from "zod";

// Models often emit list-shaped brand-voice fields (key_messaging, keywords,
// core_values, ...) as a single delimited string instead of an array. That drift
// previously crashed strategic-analysis persistence with "expected array, received
// string". Coerce a string into a trimmed, bounded array at the schema boundary so
// both the Backend emit side and the Frontend interpreter absorb it identically.
const splitDelimitedString = (input: string): string[] =>
  input
    // Numbered markers ("1.", "2)") and bullet glyphs become line breaks first.
    .replace(/\s*\d+[.)]\s+/g, "\n")
    .replace(/\s*[•▪◦‣·]\s+/g, "\n")
    .split(/\r?\n|;|\|/u)
    // Strip a leading dash/asterisk bullet left on each segment.
    .map((segment) => segment.replace(/^\s*[-*–]\s+/u, "").trim())
    .filter((segment) => segment.length > 0);

// Extracts a usable string from one array element. Objects are mined for a known
// text-bearing key — NEVER String(obj), which would yield "[object Object]" (that
// leaked through as a valid string, breaking React list keys and polluting prompts).
// Returns null to drop anything we can't represent as text.
const itemToString = (item: unknown): string | null => {
  if (typeof item === "string") return item;
  if (typeof item === "number" || typeof item === "boolean") return String(item);
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    for (const key of ["text", "value", "label", "title", "name", "message", "pillar", "summary"]) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
  }
  return null;
};

export const coerceStringArray =
  (opts?: { maxLen?: number; maxItems?: number }) =>
  (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    const rawItems = Array.isArray(value)
      ? value.map(itemToString)
      : typeof value === "string"
        ? splitDelimitedString(value)
        : null;
    if (rawItems === null) return value;
    const cleaned = rawItems
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => (opts?.maxLen ? item.slice(0, opts.maxLen) : item));
    return opts?.maxItems ? cleaned.slice(0, opts.maxItems) : cleaned;
  };

const emojiUsageOptions = ["none", "minimal", "moderate", "frequent"] as const;
const emojiUsageEnum = z.enum(emojiUsageOptions);
const emojiUsageValueSchema = z.union([emojiUsageEnum, z.string().min(1).max(90)]);

const stripEmojis = (value: string): string =>
  value
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F3FB}-\u{1F3FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      "",
    )
    .trim();

const normalizeEmojiUsage = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const firstString = value.find((item) => typeof item === "string");
    if (firstString) return normalizeEmojiUsage(firstString);
    return null;
  }
  if (typeof value !== "string") return value;
  const stripped = stripEmojis(value);
  const normalized = stripped.toLowerCase();
  if (!normalized) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (emojiUsageOptions.includes(normalized as (typeof emojiUsageOptions)[number])) {
    return normalized;
  }
  const match = emojiUsageOptions.find((option) => normalized.includes(option));
  return match ?? stripped;
};

export const emojiUsageSchema = z.preprocess(normalizeEmojiUsage, emojiUsageValueSchema.nullable());

// Lenient input schema. Bounds carry a 50% overflow allowance over the
// conceptual target (tone ~280 → accepted up to 420) to absorb Gemini's
// near-miss outputs without rejecting the section.
export const brandVoiceSchema = z
  .object({
    tone: z.string().min(1).max(420).nullable().optional(),
    voice_style: z.string().max(900).nullable().optional(),
    key_messaging: z
      .preprocess(coerceStringArray({ maxLen: 420, maxItems: 10 }), z.array(z.string().max(420)).max(10))
      .nullable()
      .optional(),
    keywords: z
      .preprocess(coerceStringArray({ maxLen: 90, maxItems: 30 }), z.array(z.string().min(1).max(90)).max(30))
      .nullable()
      .optional(),
    emoji_usage: emojiUsageSchema.nullable().optional(),
    mission: z.string().max(600).nullable().optional(),
    vision: z.string().max(600).nullable().optional(),
    core_values: z
      .preprocess(coerceStringArray({ maxLen: 180, maxItems: 12 }), z.array(z.string().max(180)).max(12))
      .nullable()
      .optional(),
    banned_words: z
      .preprocess(coerceStringArray({ maxLen: 90, maxItems: 30 }), z.array(z.string().min(1).max(90)).max(30))
      .nullable()
      .optional(),
    power_verbs: z
      .preprocess(coerceStringArray({ maxLen: 60, maxItems: 22 }), z.array(z.string().min(1).max(60)).max(22))
      .nullable()
      .optional(),
  })
  .loose();
export type BrandVoice = z.infer<typeof brandVoiceSchema>;
