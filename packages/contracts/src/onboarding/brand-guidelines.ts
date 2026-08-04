import { z } from 'zod';

import { emojiUsageSchema } from './brand-voice';

// Operational baseline guidelines — the enforceable content rules the downstream
// organic/paid/AI-Studio agents apply post-by-post. This is the operational
// projection of voice + strategy (supersedes the loose brandVoice.banned_words /
// power_verbs). Array fields default to [] so a partial synthesis still parses;
// plain z.object strips unknown keys (LLM-output safe, like readinessAnalysisSchema).

export const voiceRulesSchema = z.object({
  dos: z.array(z.string().min(1).max(240)).max(12).default([]),
  donts: z.array(z.string().min(1).max(240)).max(12).default([]),
});
export type VoiceRules = z.infer<typeof voiceRulesSchema>;

export const tonalRuleSchema = z.object({
  dimension: z.string().min(1).max(90),
  guidance: z.string().min(1).max(300),
});
export type TonalRule = z.infer<typeof tonalRuleSchema>;

export const messagingGuardrailsSchema = z.object({
  required_themes: z.array(z.string().min(1).max(180)).max(12).default([]),
  avoid_themes: z.array(z.string().min(1).max(180)).max(12).default([]),
  banned_words: z.array(z.string().min(1).max(90)).max(30).default([]),
  preferred_terms: z.array(z.string().min(1).max(90)).max(30).default([]),
});
export type MessagingGuardrails = z.infer<typeof messagingGuardrailsSchema>;

export const guidelineContentPillarSchema = z.object({
  pillar: z.string().min(1).max(120),
  description: z.string().min(1).max(420),
});
export type GuidelineContentPillar = z.infer<typeof guidelineContentPillarSchema>;

export const brandFormattingSchema = z.object({
  emoji_usage: emojiUsageSchema.nullable().optional(),
  cta_style: z.string().max(300).nullable().optional(),
  hashtag_policy: z.string().max(300).nullable().optional(),
});
export type BrandFormatting = z.infer<typeof brandFormattingSchema>;

export const brandGuidelinesSchema = z.object({
  voice_rules: voiceRulesSchema,
  tonal_rules: z.array(tonalRuleSchema).max(8).default([]),
  messaging_guardrails: messagingGuardrailsSchema,
  content_pillars: z.array(guidelineContentPillarSchema).max(8).default([]),
  formatting: brandFormattingSchema.nullable().optional(),
});
export type BrandGuidelines = z.infer<typeof brandGuidelinesSchema>;
