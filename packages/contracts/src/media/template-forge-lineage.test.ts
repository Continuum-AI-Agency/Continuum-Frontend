import { describe, expect, it } from 'bun:test';
import {
  FORGE_REASONS,
  forgeLineageHasReason,
  forgeLineageVariantOfAttachment,
  forgeLineageNodeSchema,
  forgeLineageViewSchema,
  forgeReasonSchema,
  forgeWorktreeSchema,
} from './template-forge-lineage';

const ROOT = {
  sha: 'a'.repeat(64),
  tool: 'intake',
  reason: 'intake',
  gitOp: 'commit',
  base: 'a'.repeat(64),
  refs: ['ngrbigguypantsok/master'],
  tags: {},
  children: [
    {
      sha: 'b'.repeat(64),
      tool: 'forge ratio',
      reason: 'geometry',
      gitOp: 'commit',
      ops: 40,
      refs: ['ngrbigguypantsok/story/base'],
      tags: { class: 'base' },
      children: [],
    },
  ],
};

describe('forgeReasonSchema', () => {
  it('is a closed list the Forge tab can chip on', () => {
    expect(FORGE_REASONS).toContain('geometry');
    expect(forgeReasonSchema.parse('authored')).toBe('authored');
    expect(() => forgeReasonSchema.parse('recolour')).toThrow();
  });
});

describe('forgeLineageNodeSchema', () => {
  it('reads a gospel root with a sibling-ready child', () => {
    const parsed = forgeLineageNodeSchema.parse(ROOT);
    expect(parsed.reason).toBe('intake');
    expect(parsed.children[0]?.reason).toBe('geometry');
    expect(forgeLineageHasReason(parsed, 'geometry')).toBe(true);
    expect(forgeLineageHasReason(parsed, 'product')).toBe(false);
  });

  it('keeps extra tag keys the forge may hang later', () => {
    const parsed = forgeLineageNodeSchema.parse({
      ...ROOT,
      children: [],
      tags: { shipped: { attachmentId: 1 }, 'ae-accepted': true },
    });
    expect(parsed.tags.shipped).toEqual({ attachmentId: 1 });
  });
});

describe('forgeLineageViewSchema', () => {
  it('distinguishes unset forge from an unknown sha', () => {
    expect(
      forgeLineageViewSchema.parse({
        connected: false,
        known: false,
        master: null,
        currentMaster: null,
        pinnedToOlderMaster: false,
        roots: [],
        log: [],
        worktrees: [],
        refs: {},
      }).connected,
    ).toBe(false);
    expect(
      forgeLineageViewSchema.parse({
        connected: true,
        known: false,
        master: 'a'.repeat(64),
        currentMaster: 'a'.repeat(64),
        pinnedToOlderMaster: false,
        roots: [],
        log: [],
        worktrees: [],
        refs: {},
      }).known,
    ).toBe(false);
  });
});

describe('forgeWorktreeSchema', () => {
  it('reads a locked checkout', () => {
    const parsed = forgeWorktreeSchema.parse({
      id: 'wt_1',
      commit: 'a'.repeat(64),
      locked: true,
      gitOp: 'worktree',
      reason: 'authored',
    });
    expect(parsed.locked).toBe(true);
  });
});

describe('forgeLineageVariantOfAttachment', () => {
  const tree = {
    roots: [
      forgeLineageNodeSchema.parse({
        ...ROOT,
        tags: { shipped: { attachmentId: 11 } },
        children: [
          {
            sha: 'c'.repeat(64),
            id: 'd'.repeat(64),
            refs: ['inyogo/9:16/base'],
            tags: { shipped: { attachmentId: 42 }, state: 'accepted' },
            children: [],
          },
          {
            sha: 'from-ledger',
            refs: ['inyogo/1:1/base'],
            tags: { shipped: { attachmentId: 43 } },
            children: [],
          },
        ],
      }),
    ],
  };

  it('names the variant the live attachment came from', () => {
    expect(forgeLineageVariantOfAttachment(tree, 42)).toEqual({
      commitSha: 'd'.repeat(64),
      ref: 'inyogo/9:16/base',
    });
  });

  it('prefers the commit id over the checkout blob', () => {
    // `sha` is the bytes, `id` is the instruction set that produced them. Pinning the blob would
    // name two different commits identically whenever a materialised AEP is byte-identical.
    expect(forgeLineageVariantOfAttachment(tree, 42)?.commitSha).not.toBe('c'.repeat(64));
  });

  it('carries an unnamed head as a commit with no ref', () => {
    expect(forgeLineageVariantOfAttachment(tree, 11)).toEqual({
      commitSha: 'a'.repeat(64),
      ref: 'ngrbigguypantsok/master',
    });
  });

  it('refuses the ledger placeholder — it names bytes nobody has', () => {
    expect(forgeLineageVariantOfAttachment(tree, 43)).toBeNull();
  });

  it('is UNCHECKED, not clean, when the tree has not recorded these bytes', () => {
    expect(forgeLineageVariantOfAttachment(tree, 999)).toBeNull();
    expect(forgeLineageVariantOfAttachment(tree, null)).toBeNull();
    expect(forgeLineageVariantOfAttachment({ roots: [] }, 42)).toBeNull();
  });
});
