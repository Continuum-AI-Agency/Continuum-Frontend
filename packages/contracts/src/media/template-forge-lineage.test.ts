import { describe, expect, it } from 'bun:test';
import {
  FORGE_REASONS,
  forgeLineageHasReason,
  forgeLineageNodeSchema,
  forgeLineageVariantOfAttachment,
  forgeLineageVariantOfRef,
  forgeLineageViewSchema,
  forgeReasonSchema,
  forgeWorktreeSchema,
  forgeLineageMirrorUsable,
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

describe('forgeLineageVariantOfRef', () => {
  const tree = {
    roots: [
      forgeLineageNodeSchema.parse({
        ...ROOT,
        refs: ['inyogo/master'],
        children: [
          {
            sha: 'c'.repeat(64),
            id: 'd'.repeat(64),
            refs: ['inyogo/9:16/base', 'inyogo/9:16/base@published'],
            children: [],
          },
          {
            sha: 'from-ledger',
            refs: ['inyogo/1:1/base'],
            children: [],
          },
        ],
      }),
    ],
  };

  it('names the commit a chosen head points at, however deep it sits', () => {
    expect(forgeLineageVariantOfRef(tree, 'inyogo/9:16/base')).toEqual({
      commitSha: 'd'.repeat(64),
      ref: 'inyogo/9:16/base',
    });
  });

  it('matches any of a node’s refs, and answers with the one that was asked for', () => {
    // A node carries several names — a head and its @state alias. Answering with refs[0]
    // would report a ref the caller did not choose back onto the job row.
    expect(forgeLineageVariantOfRef(tree, 'inyogo/9:16/base@published')).toEqual({
      commitSha: 'd'.repeat(64),
      ref: 'inyogo/9:16/base@published',
    });
  });

  it('refuses a ref nothing carries, rather than falling back to a root', () => {
    expect(forgeLineageVariantOfRef(tree, 'inyogo/4:5/base')).toBeNull();
    expect(forgeLineageVariantOfRef(tree, '')).toBeNull();
    expect(forgeLineageVariantOfRef(tree, null)).toBeNull();
  });

  it('never pins to the ledger placeholder', () => {
    // `from-ledger` is a node the store knows OF but does not hold bytes for. Pinning a render
    // to it would name a commit nobody can check out.
    expect(forgeLineageVariantOfRef(tree, 'inyogo/1:1/base')).toBeNull();
  });

  it('matches exactly — a prefix is a different variant', () => {
    expect(forgeLineageVariantOfRef(tree, 'inyogo/9:16')).toBeNull();
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

describe('forgeLineageMirrorUsable', () => {
  it('shows a mirrored tree only when both gospels are known and equal', () => {
    expect(forgeLineageMirrorUsable('a'.repeat(64), 'a'.repeat(64))).toBe(true);
  });

  it('withholds a tree built for a different gospel', () => {
    expect(forgeLineageMirrorUsable('a'.repeat(64), 'b'.repeat(64))).toBe(false);
  });

  // The rule that was missing. `master && cached.master && master !== cached.master` skipped the
  // comparison entirely when either side was null, so a cache row with no master was served for
  // ANY template — a tree nobody can prove belongs to this design, rendered as fact.
  it('withholds when either side has no master at all', () => {
    expect(forgeLineageMirrorUsable(null, 'a'.repeat(64))).toBe(false);
    expect(forgeLineageMirrorUsable('a'.repeat(64), null)).toBe(false);
    expect(forgeLineageMirrorUsable(null, null)).toBe(false);
    expect(forgeLineageMirrorUsable(undefined, undefined)).toBe(false);
    expect(forgeLineageMirrorUsable('', 'a'.repeat(64))).toBe(false);
  });
});
