// Canonical brand-skill shapes shared by Frontend (composer picker, @-mention,
// management panel) and Backend (skills CRUD repo, agent context injection,
// load_skill tool). DB rows are snake_case; these boundary shapes are camelCase
// and the API layer maps between them.

import { z } from "zod";

// creative_direction: how content should look/sound/feel (the MVP focus).
// analytic: repeatable audit / analysis workflows.
export const skillKindSchema = z.enum(["creative_direction", "analytic"]);
export type SkillKind = z.infer<typeof skillKindSchema>;

export const skillStatusSchema = z.enum(["active", "archived"]);
export type SkillStatus = z.infer<typeof skillStatusSchema>;

// `directives` is the body injected into the agent's context when the skill is
// applied (picked / @-mentioned / loaded on demand). `slug` is a stable token
// for @-mention rendering; `name` is the human label.
export const skillSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    createdBy: z.string().nullable().optional(),
    name: z.string().min(1),
    slug: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    kind: skillKindSchema,
    directives: z.string().min(1),
    tags: z.array(z.string()).default([]),
    status: skillStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type Skill = z.infer<typeof skillSchema>;

// Lightweight shape for the prompt-injected skill index (name + description only,
// never the full directives) and for mention suggestions.
export const skillSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().nullable().optional(),
    kind: skillKindSchema,
    description: z.string().nullable().optional(),
  })
  .strict();
export type SkillSummary = z.infer<typeof skillSummarySchema>;
