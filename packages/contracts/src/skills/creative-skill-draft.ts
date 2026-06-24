// Contracts for the Creative Studio "skill from selection" flow. The canvas
// projects a few selected generation nodes into `creativeSkillSelectionSchema`
// and POSTs them to the Backend translator, which distills them into a
// `creativeSkillDraftSchema` — an un-persisted draft the user reviews before
// saving through the existing skills CRUD. Kept loose on the inbound side per the
// wire-DTO convention (unknown keys are stripped, not rejected).

import { z } from "zod";
import { skillKindSchema } from "./skill";

// One projected canvas node. The canvas sends whatever generation context the
// node carries (prompt, settings, reference roles); the translator reads what it
// can. Loose object: extra keys are dropped, missing optionals are tolerated.
export const creativeSkillSelectionNodeSchema = z.object({
  nodeType: z.string().min(1),
  prompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  model: z.string().optional(),
  aspectRatio: z.string().optional(),
  referenceRoles: z.array(z.string()).optional(),
  outputSummary: z.string().optional(),
});
export type CreativeSkillSelectionNode = z.infer<typeof creativeSkillSelectionNodeSchema>;

export const creativeSkillSelectionSchema = z.object({
  brandId: z.string().min(1),
  nodes: z.array(creativeSkillSelectionNodeSchema).min(1).max(20),
  // Optional free-text steer from the user (e.g. "focus on the lighting style").
  instructions: z.string().max(2000).optional(),
});
export type CreativeSkillSelection = z.infer<typeof creativeSkillSelectionSchema>;

// The translator's output — a ready-to-review skill draft. Mirrors the subset of
// fields a create-skill request needs (brandId is supplied at save time). `kind`
// is fixed to creative_direction because canvas skills guide generation.
export const creativeSkillDraftSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  directives: z.string().min(1).max(20000),
  tags: z.array(z.string().min(1)).max(20).default([]),
  kind: skillKindSchema.default("creative_direction"),
});
export type CreativeSkillDraft = z.infer<typeof creativeSkillDraftSchema>;

export const creativeSkillDraftResponseSchema = z.object({
  draft: creativeSkillDraftSchema,
});
export type CreativeSkillDraftResponse = z.infer<typeof creativeSkillDraftResponseSchema>;
