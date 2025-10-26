import { z } from "zod";

export type PromptSource = "preset" | "custom";

export type PromptDefinition = {
  id: string;
  name: string;
  description?: string;
  content: string;
  category: string;
  source: PromptSource;
};

export type PromptFormValue = Pick<PromptDefinition, "id" | "name" | "description" | "content" | "source">;

export const promptDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  content: z.string(),
  category: z.string(),
  source: z.enum(["preset", "custom"]),
});

export const promptFormValueSchema = promptDefinitionSchema.pick({
  id: true,
  name: true,
  description: true,
  content: true,
  source: true,
});

export const DEFAULT_PROMPTS: PromptDefinition[] = [
  {
    id: "awareness-anchor",
    name: "Awareness Anchor",
    description: "Focus on top-of-funnel storytelling and brand positioning.",
    content:
      "Craft a cohesive 7-day plan that introduces the brand, highlights signature offerings, and nurtures curiosity. Emphasize educational hooks, founder stories, and social proof to warm net-new audiences.",
    category: "Awareness",
    source: "preset",
  },
  {
    id: "engagement-orbit",
    name: "Engagement Orbit",
    description: "Drive conversation and community participation across channels.",
    content:
      "Develop a week of conversational prompts, polls, and interactive formats that invite audiences to share opinions, user-generated content, and personal stories. Spotlight community voices and encourage daily interaction.",
    category: "Engagement",
    source: "preset",
  },
  {
    id: "conversion-lift",
    name: "Conversion Lift",
    description: "Guide prospects toward a clear product or offer outcome.",
    content:
      "Design a seven-day content mix that maps benefits, urgency, testimonials, and irresistible offers. Include platform-specific CTAs that align with the buyer journey for each channel.",
    category: "Conversion",
    source: "preset",
  },
  {
    id: "thought-leadership",
    name: "Thought Leadership Sprint",
    description: "Position the brand as a category expert with authoritative POVs.",
    content:
      "Outline a 7-day cadence of insights, data-backed takes, and futurecasting content that helps the audience anticipate trends and apply strategic guidance. Blend long-form perspectives with snackable stats.",
    category: "Authority",
    source: "preset",
  },
];

export function toPromptFormValue(definition: PromptDefinition): PromptFormValue {
  const { id, name, description, content, source } = definition;
  return { id, name, description, content, source };
}
