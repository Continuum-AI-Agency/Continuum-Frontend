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

export const FORGE_FACETS = [
  'colour',
  'type',
  'layout',
  'animation',
  'legal',
  'audio',
  'footage',
] as const;
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
    /**
     * Set when this view came from the MIRROR rather than from the forge — the moment the forge
     * last answered for this template.
     *
     * Null means live. A cached tree is never presented as live: the forge store is the authority
     * and a mirror can be behind it, so the reader is told how old the answer is rather than left
     * to assume it is current.
     */
    cachedAt: z.string().nullable().default(null),
    /**
     * Why this view is empty, when the reason is something other than "no forge configured".
     *
     * `connected: false` was carrying two unrelated meanings and the UI rendered both as
     * "Template Forge is not configured". A brand whose mirror row failed to READ was told its
     * forge was switched off — an answer that sends someone to check settings that are fine.
     *
     *   `null`                  — nothing went wrong; read `connected` as usual.
     *   `mirror_unreadable`     — the mirror row could not be read. supabase-js RESOLVES with
     *                             an error object rather than throwing, so this case reached
     *                             the caller as an ordinary empty result for as long as the
     *                             reader existed.
     *   `mirror_wrong_master`   — a row exists, built for a different gospel. Withheld on
     *                             purpose: a tree for another design is worse than no tree,
     *                             because it looks like an answer.
     */
    unavailable: z
      .enum(['mirror_unreadable', 'mirror_wrong_master'])
      .nullable()
      .default(null),
  })
  .strict();
export type ForgeLineageView = z.infer<typeof forgeLineageViewSchema>;

/**
 * May a mirrored tree built for `cachedMaster` be shown for a template whose gospel is
 * `liveMaster`? Only when both are known AND equal.
 *
 * The old rule was `master && cached.master && master !== cached.master` — which SKIPPED the
 * comparison whenever either side was null, so a cache row with no master was served for any
 * template at all. A null on either side means nobody can prove the tree belongs to this
 * design, and an unprovable tree is exactly the thing that must not be rendered as fact.
 */
export function forgeLineageMirrorUsable(
  liveMaster: string | null | undefined,
  cachedMaster: string | null | undefined,
): boolean {
  if (!liveMaster || !cachedMaster) return false;
  return liveMaster === cachedMaster;
}

export function forgeLineageHasReason(node: ForgeLineageNode, reason: string): boolean {
  if (node.reason === reason) return true;
  return node.children.some((child) => forgeLineageHasReason(child, reason));
}

/** The variant a render is of: the store commit, and the named head it carried. */
export type ForgeVariantPin = { commitSha: string; ref: string | null };

/**
 * Which VARIANT the template's graph is currently pointed at, named from the version tree.
 *
 * The forge's pin answers with an ATTACHMENT id and its bytes; the tree hangs `shipped` on the
 * commit those bytes came from. Matching the two is the only way a render can say it is the 9:16
 * cut rather than merely naming a sha256 — see template-forge `docs/TEMPLATE_IDENTITY.md`.
 *
 * Returns null for every UNCHECKED case, and they are all the same answer: no attachment id, no
 * cached tree, or a tree that has not recorded these bytes. A commit stamped `from-ledger` is a
 * fork whose checkout was deleted — it names bytes nobody has, so it is not a pin either.
 */
/**
 * The commit a NAMED head points at — the same walk as `forgeLineageVariantOfAttachment`, asked
 * the other way round.
 *
 * The attachment lookup answers "which variant is the template pointing at right now", which is
 * what a render pins itself to when nobody chooses. This answers "which commit does THIS ref
 * name", which is what an operator picking a row off the variants panel is asking for. One
 * function per direction rather than one clever one: the predicates differ, the refusal differs
 * (an unknown ref is a 409 a person must see, an unmatched attachment is a quiet `absent`), and
 * merging them would hide that.
 *
 * Null when no node carries the ref, so the caller refuses rather than falling back to the live
 * pointer — silently rendering something other than what was chosen is the whole failure here.
 */
export function forgeLineageVariantOfRef(
  view: Pick<ForgeLineageView, 'roots'>,
  ref: string | null | undefined,
): ForgeVariantPin | null {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const wanted = ref.trim();

  const walk = (node: ForgeLineageNode): ForgeVariantPin | null => {
    if (node.refs.includes(wanted)) {
      // Same rule as the attachment walk: `id` is the commit, `sha` is the checkout blob and is
      // the commit only for an intake, and the ledger placeholder is never a pin.
      const commitSha = node.id || node.sha;
      if (commitSha && commitSha !== 'from-ledger') return { commitSha, ref: wanted };
    }
    for (const child of node.children ?? []) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };

  for (const root of view.roots) {
    const hit = walk(root);
    if (hit) return hit;
  }
  return null;
}

export function forgeLineageVariantOfAttachment(
  view: Pick<ForgeLineageView, 'roots'>,
  attachmentId: number | null | undefined,
): ForgeVariantPin | null {
  if (typeof attachmentId !== 'number' || !Number.isFinite(attachmentId)) return null;

  const shippedAs = (node: ForgeLineageNode): number | null => {
    const shipped = (node.tags ?? {}).shipped as { attachmentId?: unknown } | undefined;
    return typeof shipped?.attachmentId === 'number' ? shipped.attachmentId : null;
  };

  const walk = (node: ForgeLineageNode): ForgeVariantPin | null => {
    if (shippedAs(node) === attachmentId) {
      // `id` is the commit (a hash of the instruction set); `sha` is the checkout blob and is the
      // commit only for an intake. Prefer the commit, and never pin to the ledger placeholder.
      const commitSha = node.id || node.sha;
      if (commitSha && commitSha !== 'from-ledger') {
        return { commitSha, ref: node.refs[0] ?? null };
      }
    }
    for (const child of node.children ?? []) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };

  for (const root of view.roots) {
    const hit = walk(root);
    if (hit) return hit;
  }
  return null;
}
