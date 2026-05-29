import { z } from "zod";

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
    key_messaging: z.array(z.string().max(420)).max(10).nullable().optional(),
    keywords: z.array(z.string().min(1).max(90)).max(30).nullable().optional(),
    emoji_usage: emojiUsageSchema.nullable().optional(),
    mission: z.string().max(600).nullable().optional(),
    vision: z.string().max(600).nullable().optional(),
    core_values: z.array(z.string().max(180)).max(12).nullable().optional(),
    banned_words: z.array(z.string().min(1).max(90)).max(30).nullable().optional(),
    power_verbs: z.array(z.string().min(1).max(60)).max(22).nullable().optional(),
  })
  .loose();
export type BrandVoice = z.infer<typeof brandVoiceSchema>;
