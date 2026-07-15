// Canonical brand-skill shapes shared by Frontend (composer picker, @-mention,
// management panel) and Backend (skills CRUD repo, agent context injection,
// load_skill tool). DB rows are snake_case; these boundary shapes are camelCase
// and the API layer maps between them.

import { z } from 'zod';

// How content should look / sound / feel. (There was historically an `analytic`
// kind for audit workflows; nothing ever consumed it, so it has been retired —
// every skill is creative direction now. The single-member enum is kept so DB
// rows and the `kind` column still round-trip.)
export const skillKindSchema = z.enum(['creative_direction']);
export type SkillKind = z.infer<typeof skillKindSchema>;

// Which generator a skill steers: `copy` = text/editorial (organic agent),
// `visual` = image/video generation (AI Studio), `both` = either. Pickers and
// grounding filters key on this so a copy skill never clutters the visual surface
// and a visual skill never clutters the copy surface.
export const skillSurfaceSchema = z.enum(['copy', 'visual', 'both']);
export type SkillSurface = z.infer<typeof skillSurfaceSchema>;

export const skillStatusSchema = z.enum(['active', 'archived']);
export type SkillStatus = z.infer<typeof skillStatusSchema>;

// `directives` is the body injected into the agent's context when the skill is
// applied (picked / @-mentioned / loaded on demand). `slug` is a stable token
// for @-mention rendering; `name` is the human label.
// `brandId` is null for first-party global templates (`isTemplate: true`), which
// are curated, cross-brand, and seed-managed (never user-editable). A regular
// brand skill always has a `brandId` and `isTemplate: false`.
export const skillSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1).nullable(),
    isTemplate: z.boolean().default(false),
    createdBy: z.string().nullable().optional(),
    name: z.string().min(1),
    slug: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    kind: skillKindSchema,
    surface: skillSurfaceSchema.default('both'),
    directives: z.string().min(1),
    tags: z.array(z.string()).default([]),
    status: skillStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type Skill = z.infer<typeof skillSchema>;

// Lightweight shape for the prompt-injected skill index (name + description only,
// never the full directives) and for mention suggestions. `isTemplate` lets the
// FE split brand skills from the first-party library.
export const skillSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().nullable().optional(),
    kind: skillKindSchema,
    description: z.string().nullable().optional(),
    isTemplate: z.boolean().default(false),
  })
  .strict();
export type SkillSummary = z.infer<typeof skillSummarySchema>;
