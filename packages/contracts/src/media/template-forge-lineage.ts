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
    unavailable: z.enum(['mirror_unreadable', 'mirror_wrong_master']).nullable().default(null),
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
 * The commit a NAMED head points at in the tree — what an operator picking a checkpoint is asking
 * for. Null when no node carries the ref, so the caller refuses rather than falling back to the
 * live checkpoint: silently rendering something other than what was chosen is the whole failure.
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

/**
 * One CHECKPOINT — one commit of the template's version tree — however the view learned of it.
 *
 * In git terms: a commit. An upload is a root commit whose id IS its file's sha256; every later
 * change (a clean-up, a size, an autofix round, a language fork, a look, a delivery flip) is a
 * commit whose id hashes the instructions that made it, with `parent` the one before it and `base`
 * the upload it all started from. Refs are branch names (`<key>/story/base`) or tags
 * (`<workspace>/<key>@published`); `tags` are the notes the store hangs on a commit.
 */
export type ForgeCheckpoint = {
  id: string;
  parent: string | null;
  base: string | null;
  at: string | null;
  tool: string | null;
  reason: string | null;
  facet: string | null;
  why: string | null;
  ops: number | null;
  /** The file an upload was made from. */
  file: string | null;
  /** sha256 of the checkpoint's own bytes: the id for an upload, the checkout blob otherwise. */
  blob: string | null;
  refs: string[];
  tags: Record<string, unknown>;
};

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const fileOf = (input: unknown): string | null =>
  textOf((input as { filename?: unknown } | null | undefined)?.filename);
const shaOf = (value: string | null | undefined): string | null =>
  value ? value.replace(/^sha256:/, '').toLowerCase() : null;

/**
 * Every checkpoint the view knows, parents before children: the tree's nodes, then the log's rows
 * the tree did not return. In production the log is usually the ONLY place a template's commits
 * appear — every cached tree on 2026-09-29 had `roots: []` and one upload commit in `log` — so a
 * view built from the tree alone showed "empty" for a template with a perfectly good history.
 */
export function forgeCheckpointsOf(
  view: Pick<ForgeLineageView, 'roots' | 'log' | 'refs'>,
): ForgeCheckpoint[] {
  const byId = new Map<string, ForgeCheckpoint>();
  const refsTo = (id: string) =>
    Object.entries(view.refs)
      .filter(([, commit]) => commit === id)
      .map(([name]) => name);
  const walk = (node: ForgeLineageNode, parent: string | null) => {
    const id = node.id || node.sha;
    const real = id && id !== 'from-ledger';
    if (real && !byId.has(id)) {
      byId.set(id, {
        id,
        parent,
        base: node.base ?? null,
        at: textOf((node as { at?: unknown }).at),
        tool: node.tool ?? null,
        reason: node.reason ?? null,
        facet: node.facet ?? null,
        why: node.why ?? null,
        ops: typeof node.ops === 'number' ? node.ops : null,
        file: fileOf(node.input),
        blob: shaOf(textOf(node.checkout?.blob) ?? (node.sha !== 'from-ledger' ? node.sha : null)),
        refs: [...new Set([...node.refs, ...refsTo(id)])],
        tags: node.tags ?? {},
      });
    }
    for (const child of node.children ?? []) walk(child, real ? id : parent);
  };
  for (const root of view.roots) walk(root, null);
  // The log runs from the head back to the root; reversed, a parent lands before its child.
  for (const row of [...view.log].reverse()) {
    const id = row.id ?? row.child;
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      parent: row.parent ?? null,
      base: row.base ?? null,
      at: row.at ?? null,
      tool: row.tool ?? null,
      reason: row.reason ?? null,
      facet: row.facet ?? null,
      why: row.why ?? null,
      ops: typeof row.ops === 'number' ? row.ops : Array.isArray(row.ops) ? row.ops.length : null,
      file: fileOf(row.input),
      blob: shaOf(textOf(row.checkout?.blob) ?? (row.parent ? null : id)),
      refs: refsTo(id),
      tags: {},
    });
  }
  return [...byId.values()];
}

/**
 * The refs that are THIS template's. The store's ref map is workspace-wide — every template's refs,
 * other tenants' included — so a view must never hand the whole map to a browser. Kept:
 *
 *   - a tag or branch named for this template (`<workspace>/<key>@published`);
 *   - a branch its own tree carries;
 *   - a branch pointing at one of its own checkpoints.
 *
 * A TAG on its checkpoint that names another template is dropped: two templates can publish the
 * very same bytes (171/174/175/180 did), and the other one's tag is not this template's to show.
 */
export function forgeTemplateRefs(
  view: Pick<ForgeLineageView, 'refs' | 'roots' | 'log' | 'master'>,
  ids: { workspace?: string | null; templateKey?: string | null },
): Record<string, string> {
  const own = new Set<string>();
  const commits = new Set<string>(view.master ? [view.master] : []);
  const walk = (node: ForgeLineageNode) => {
    for (const ref of node.refs) own.add(ref);
    commits.add(node.id || node.sha);
    for (const child of node.children ?? []) walk(child);
  };
  for (const root of view.roots) walk(root);
  for (const row of view.log) {
    const id = row.id ?? row.child;
    if (id) commits.add(id);
  }
  return Object.fromEntries(
    Object.entries(view.refs).filter(([name, commit]) =>
      name.includes('@') ? ownTag(name, ids) : own.has(name) || commits.has(commit),
    ),
  );
}

/**
 * A TAG (`<workspace>/<key>@state`) is this template's only when it names this template. A shared
 * commit's node carries every template's tags, so "it is on my tree" proves nothing for a tag.
 */
function ownTag(name: string, ids: { workspace?: string | null; templateKey?: string | null }) {
  return (
    !!ids.workspace &&
    !!ids.templateKey &&
    name.split('@')[0] === `${ids.workspace}/${ids.templateKey}`
  );
}

/** Tags a view may carry across the boundary: facts about the bytes, not about who used them. */
const SCOPED_TAGS = ['state', 'ae-accepted', 'class', 'rows'] as const;

/**
 * The view as ONE brand's template may see it. The forge store is content-addressed and
 * workspace-wide, so the same bytes uploaded by two brands are ONE commit: its node carries every
 * template's tags, its `shipped`/`pointer` notes name whichever template wrote last, and its log row
 * names whoever uploaded it first — brand, asset and filename. On 2026-09-30 two packages were
 * shared across brands this way (templates 171/174/175/180 and 176/179/183). So, before a view
 * leaves the Backend:
 *
 *   - refs, on the map and on every node, pass `forgeTemplateRefs`'s rule;
 *   - node tags keep only the byte facts in SCOPED_TAGS;
 *   - an upload's `input` survives only when this brand made it;
 *   - worktree paths are dropped.
 */
export function forgeScopeView(
  view: ForgeLineageView,
  ids: { workspace?: string | null; templateKey?: string | null; brandId: string },
): ForgeLineageView {
  const refs = forgeTemplateRefs(view, ids);
  // ponytail: a BRANCH on this template's own tree is kept by name alone. Production has no branch
  // refs yet (only `@published` tags); if shared bytes ever carry another template's branch, key
  // branches by the forge's template slug here.
  const ownRef = (name: string) => (name.includes('@') ? ownTag(name, ids) : true);
  const ownInput = (input: unknown) => {
    const brand = (input as { library?: { brandId?: unknown } } | null | undefined)?.library
      ?.brandId;
    return brand === ids.brandId ? input : null;
  };
  const scopeNode = (node: ForgeLineageNode): ForgeLineageNode => ({
    ...node,
    input: ownInput(node.input),
    refs: node.refs.filter(ownRef),
    tags: Object.fromEntries(
      SCOPED_TAGS.filter((key) => key in (node.tags ?? {})).map((key) => [key, node.tags[key]]),
    ),
    children: (node.children ?? []).map(scopeNode),
  });
  return {
    ...view,
    refs,
    roots: view.roots.map(scopeNode),
    log: view.log.map((row) => ({ ...row, input: ownInput(row.input) })),
    worktrees: view.worktrees.map(({ path: _path, ...worktree }) => worktree),
  };
}

/**
 * The checkpoint whose bytes are `sha256`. A render sends the worker exactly one digest and the
 * worker refuses any other file, so the checkpoint holding that digest is the one the render WILL
 * use — proven by the worker, not inferred from a pointer.
 */
export function forgeCheckpointOfBytes(
  checkpoints: readonly ForgeCheckpoint[],
  sha256: string | null | undefined,
): ForgeCheckpoint | null {
  const wanted = shaOf(sha256);
  if (!wanted) return null;
  return (
    checkpoints.find((checkpoint) => checkpoint.id === wanted || checkpoint.blob === wanted) ?? null
  );
}
