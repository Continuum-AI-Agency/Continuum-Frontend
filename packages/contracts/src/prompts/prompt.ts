// Canonical brand-prompt shapes shared by Frontend (composer picker, management
// panel) and Backend (prompts CRUD repo). DB rows are snake_case; these boundary
// shapes are camelCase and the API layer maps between them.
//
// A Prompt is the lightest of the three reusable objects, and the distinction is
// load-bearing:
//   Prompt   -- reusable text INPUT. Picking one types it into the box for you; the
//               model sees ordinary user text and nothing else changes.
//   Skill    -- reusable creative DIRECTION. Applied *alongside* whatever you typed,
//               injected into the system prompt and into generation guidance.
//   Workflow -- reusable PIPELINE (a canvas graph, which carries its own skillIds).
//
// Because a prompt is an input rather than an annotation, it is deliberately NOT a
// member of `agentMentionReferenceTypeSchema`: there is nothing for the Backend to
// resolve after the fact. The body text IS the payload.

import { z } from 'zod';

export const promptStatusSchema = z.enum(['active', 'archived']);
export type PromptStatus = z.infer<typeof promptStatusSchema>;

// `body` is the reusable prompt text itself (column `prompt`). `slug` is a stable
// display token; `name` is the human label. `category` groups the picker.
export const promptSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    createdBy: z.string().nullable().optional(),
    name: z.string().min(1),
    slug: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    body: z.string().min(1),
    category: z.string().min(1),
    tags: z.array(z.string()).default([]),
    status: promptStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type Prompt = z.infer<typeof promptSchema>;
