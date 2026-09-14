// A Template Forge version-tree, as the browser sees it.
//
// The forge names every commit by the instruction set that produced it (parent + ops + reason),
// not by a snapshot of the AEP. The master blob is gospel. A head is master + replay of the
// chain. Tags (notes) hang outside-world facts off an id without changing it. Worktrees are
// checkouts, not forks.
//
// Enums are closed because the Forge tab branches on them. Tag objects passthrough: the forge
// extends them and dropping a run to show an extra key is a worse trade.

import { z } from 'zod';

export const FORGE_REASONS = [
  'intake',
  'hygiene',
  'geometry',
  'product',
  'copy',
  'authored',
  'autofix',
  'ship',
  'dataset',
  'unknown',
] as const;
export const forgeReasonSchema = z.enum(FORGE_REASONS);
export type ForgeReason = z.infer<typeof forgeReasonSchema>;

export const FORGE_GIT_OPS = ['blob', 'commit', 'branch', 'tag', 'note', 'worktree'] as const;
export const forgeGitOpSchema = z.enum(FORGE_GIT_OPS);
export type ForgeGitOp = z.infer<typeof forgeGitOpSchema>;

export const FORGE_FACETS = ['colour', 'type', 'layout', 'animation', 'legal', 'audio', 'footage'] as const;
export const forgeFacetSchema = z.enum(FORGE_FACETS);
export type ForgeFacet = z.infer<typeof forgeFacetSchema>;

export const forgeCheckoutSchema = z
  .object({
    blob: z.string().nullable().optional(),
    path: z.string().nullable().optional(),
    at: z.string().optional(),
    commit: z.string().optional(),
  })
  .passthrough();
export type ForgeCheckout = z.infer<typeof forgeCheckoutSchema>;

export const forgeCommitSchema = z
  .object({
    id: z.string().optional(),
    parent: z.string().nullable().optional(),
    child: z.string().optional(),
    base: z.string().nullable().optional(),
    tool: z.string().nullable().optional(),
    input: z.unknown().optional(),
    ops: z.unknown().optional(),
    reason: z.string().nullable().optional(),
    facet: z.string().nullable().optional(),
    why: z.string().nullable().optional(),
    gitOp: z.string().nullable().optional(),
    at: z.string().optional(),
    checkout: forgeCheckoutSchema.nullable().optional(),
  })
  .passthrough();
export type ForgeCommit = z.infer<typeof forgeCommitSchema>;

export type ForgeLineageNode = {
  sha: string;
  id?: string;
  path?: string | null;
  tool?: string | null;
  input?: unknown;
  ops?: number | null;
  reason?: string | null;
  facet?: string | null;
  why?: string | null;
  gitOp?: string | null;
  base?: string | null;
  checkout?: ForgeCheckout | null;
  fromLedger?: boolean;
  refs: string[];
  tags: Record<string, unknown>;
  children: ForgeLineageNode[];
};

export const forgeLineageNodeSchema: z.ZodType<ForgeLineageNode> = z.lazy(() =>
  z
    .object({
      sha: z.string(),
      id: z.string().optional(),
      path: z.string().nullable().optional(),
      tool: z.string().nullable().optional(),
      input: z.unknown().optional(),
      ops: z.number().int().nullable().optional(),
      reason: z.string().nullable().optional(),
      facet: z.string().nullable().optional(),
      why: z.string().nullable().optional(),
      gitOp: z.string().nullable().optional(),
      base: z.string().nullable().optional(),
      checkout: forgeCheckoutSchema.nullable().optional(),
      fromLedger: z.boolean().optional(),
      refs: z.array(z.string()).default([]),
      tags: z.record(z.string(), z.unknown()).default({}),
      children: z.array(forgeLineageNodeSchema),
    })
    .passthrough(),
);

export const forgeWorktreeSchema = z
  .object({
    id: z.string(),
    commit: z.string(),
    base: z.string().nullable().optional(),
    ref: z.string().nullable().optional(),
    path: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
    facet: z.string().nullable().optional(),
    locked: z.boolean().optional(),
    gitOp: z.literal('worktree').optional(),
    at: z.string().optional(),
    plan: z.string().nullable().optional(),
  })
  .passthrough();
export type ForgeWorktree = z.infer<typeof forgeWorktreeSchema>;

export const forgeRefEntrySchema = z
  .object({
    commit: z.string(),
    gitOp: z.string(),
    base: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
  })
  .passthrough();
export type ForgeRefEntry = z.infer<typeof forgeRefEntrySchema>;

/**
 * What the Forge tab reads. `connected: false` is TEMPLATE_FORGE_URL unset — do not invent a
 * tree. `known: false` is a source the store has not recorded yet.
 */
export const forgeLineageViewSchema = z
  .object({
    connected: z.boolean(),
    known: z.boolean(),
    master: z.string().nullable(),
    currentMaster: z.string().nullable(),
    pinnedToOlderMaster: z.boolean(),
    roots: z.array(forgeLineageNodeSchema),
    log: z.array(forgeCommitSchema),
    worktrees: z.array(forgeWorktreeSchema),
    refs: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type ForgeLineageView = z.infer<typeof forgeLineageViewSchema>;

export function forgeLineageHasReason(node: ForgeLineageNode, reason: string): boolean {
  if (node.reason === reason) return true;
  return node.children.some((child) => forgeLineageHasReason(child, reason));
}
