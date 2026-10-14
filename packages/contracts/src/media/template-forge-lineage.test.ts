import { describe, expect, it } from 'bun:test';
import {
  FORGE_REASONS,
  forgeCheckpointOfBytes,
  forgeCheckpointsOf,
  forgeLineageHasReason,
  forgeLineageMirrorUsable,
  forgeLineageNodeSchema,
  forgeLineageVariantOfRef,
  forgeLineageViewSchema,
  forgeReasonSchema,
  forgeScopeView,
  forgeTemplateRefs,
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

// The production shape on 2026-09-29: the tree came back empty, the one upload commit only in the
// log, and the ref map held every template of the workspace — other tenants' included.
const UPLOAD = '881c3036'.padEnd(64, '0');
const OTHER = '066a6ca9'.padEnd(64, '0');
const PROD_VIEW = forgeLineageViewSchema.parse({
  connected: true,
  known: true,
  master: UPLOAD,
  currentMaster: UPLOAD,
  pinnedToOlderMaster: false,
  roots: [],
  log: [
    {
      at: '2026-09-30T02:54:21.182Z',
      id: UPLOAD,
      parent: null,
      base: UPLOAD,
      tool: 'intake',
      reason: 'intake',
      gitOp: 'commit',
      input: { filename: 'utec-spaced-typography-254.zip' },
      checkout: { blob: UPLOAD, path: null },
    },
  ],
  worktrees: [],
  refs: {
    'Continuum_app/277@published': UPLOAD,
    'Continuum_app/171@published': OTHER,
    'Continuum_app/174@published': OTHER,
  },
});

describe('forgeCheckpointsOf', () => {
  it('reads a template whose tree is empty from its log, with the refs that name each commit', () => {
    expect(forgeCheckpointsOf(PROD_VIEW)).toEqual([
      {
        id: UPLOAD,
        parent: null,
        base: UPLOAD,
        at: '2026-09-30T02:54:21.182Z',
        tool: 'intake',
        reason: 'intake',
        facet: null,
        why: null,
        ops: null,
        file: 'utec-spaced-typography-254.zip',
        blob: UPLOAD,
        refs: ['Continuum_app/277@published'],
        tags: {},
      },
    ]);
  });

  it('walks the tree parent-first and does not repeat a commit the log also lists', () => {
    const view = forgeLineageViewSchema.parse({
      ...PROD_VIEW,
      roots: [ROOT],
      log: [{ id: 'a'.repeat(64), parent: null, tool: 'intake', reason: 'intake' }],
      refs: {},
    });
    const checkpoints = forgeCheckpointsOf(view);
    expect(
      checkpoints.map((c) => [c.id.slice(0, 1), c.parent?.slice(0, 1) ?? null, c.refs]),
    ).toEqual([
      ['a', null, ['ngrbigguypantsok/master']],
      ['b', 'a', ['ngrbigguypantsok/story/base']],
    ]);
  });
});

describe('forgeTemplateRefs', () => {
  it('keeps this template’s own refs and drops every other template’s', () => {
    expect(
      forgeTemplateRefs(PROD_VIEW, { workspace: 'Continuum_app', templateKey: '277' }),
    ).toEqual({
      'Continuum_app/277@published': UPLOAD,
    });
  });

  it('keeps the branch names its own tree carries', () => {
    const view = forgeLineageViewSchema.parse({
      ...PROD_VIEW,
      roots: [ROOT],
      refs: { ...PROD_VIEW.refs, 'ngrbigguypantsok/story/base': 'b'.repeat(64) },
    });
    expect(
      Object.keys(forgeTemplateRefs(view, { workspace: 'Continuum_app', templateKey: '277' })),
    ).toEqual(['Continuum_app/277@published', 'ngrbigguypantsok/story/base']);
  });

  it('keeps a branch on its own checkpoint, drops another template’s tag on the same bytes', () => {
    const view = forgeLineageViewSchema.parse({
      ...PROD_VIEW,
      refs: { ...PROD_VIEW.refs, 'Continuum_app/999@published': UPLOAD, 'utec/9:16/base': UPLOAD },
    });
    expect(forgeTemplateRefs(view, { workspace: 'Continuum_app', templateKey: '277' })).toEqual({
      'Continuum_app/277@published': UPLOAD,
      'utec/9:16/base': UPLOAD,
    });
  });

  it('with no key to match, keeps no tags at all', () => {
    expect(forgeTemplateRefs(PROD_VIEW, { workspace: null, templateKey: null })).toEqual({});
  });
});

describe('forgeCheckpointOfBytes', () => {
  const checkpoints = forgeCheckpointsOf(PROD_VIEW);
  it('finds the checkpoint whose bytes the worker will insist on', () => {
    expect(forgeCheckpointOfBytes(checkpoints, `sha256:${UPLOAD.toUpperCase()}`)?.id).toBe(UPLOAD);
  });
  it('bytes no checkpoint holds, and no digest, find nothing', () => {
    expect(forgeCheckpointOfBytes(checkpoints, OTHER)).toBeNull();
    expect(forgeCheckpointOfBytes(checkpoints, null)).toBeNull();
  });
});

// The duplicate-upload case, as production has it (2026-09-30): one package published as 171/174/175
// by brand A and as 180 by brand B. The store keeps it as ONE commit, and that commit's node, notes
// and log row name brand A.
describe('forgeScopeView', () => {
  const BRAND_A = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
  const BRAND_B = '0f4a3c4b-03e4-4ed4-8805-5516ba199ec1';
  const uploadInput = {
    filename: 'brand-a-card.zip',
    library: { brandId: BRAND_A, assetId: 'a-asset' },
  };
  const shared = forgeLineageViewSchema.parse({
    ...PROD_VIEW,
    master: OTHER,
    currentMaster: OTHER,
    roots: [
      {
        sha: OTHER,
        id: OTHER,
        tool: 'intake',
        reason: 'intake',
        input: uploadInput,
        refs: ['Continuum_app/171@published', 'Continuum_app/180@published', 'card/master'],
        tags: {
          state: 'published',
          'ae-accepted': true,
          shipped: { attachmentId: 5454, templateId: 171, draftId: 171 },
          pointer: [{ direction: 'flip', app: 'Continuum_app', template: 171 }],
        },
        children: [],
      },
    ],
    log: [{ id: OTHER, parent: null, tool: 'intake', reason: 'intake', input: uploadInput }],
    worktrees: [{ id: 'w1', commit: OTHER, path: '/srv/forge/brand-a/card.aep' }],
    refs: {
      'Continuum_app/171@published': OTHER,
      'Continuum_app/180@published': OTHER,
      'card/master': OTHER,
    },
  });

  it('brand B sees its own tag, the bytes’ facts, and nothing brand A wrote', () => {
    const view = forgeScopeView(shared, {
      workspace: 'Continuum_app',
      templateKey: '180',
      brandId: BRAND_B,
    });
    expect(view.refs).toEqual({ 'Continuum_app/180@published': OTHER, 'card/master': OTHER });
    const [node] = view.roots;
    expect(node?.refs).toEqual(['Continuum_app/180@published', 'card/master']);
    expect(node?.tags).toEqual({ state: 'published', 'ae-accepted': true });
    expect(node?.input).toBeNull();
    expect(view.log[0]?.input).toBeNull();
    expect(view.worktrees[0]).toEqual({ id: 'w1', commit: OTHER });
    // The checkpoint is still there and still live for brand B: only the other brand's words are gone.
    expect(forgeCheckpointsOf(view).map((c) => [c.id, c.file, c.refs])).toEqual([
      [OTHER, null, ['Continuum_app/180@published', 'card/master']],
    ]);
  });

  it('the brand that uploaded it keeps its own filename', () => {
    const view = forgeScopeView(shared, {
      workspace: 'Continuum_app',
      templateKey: '171',
      brandId: BRAND_A,
    });
    expect(view.roots[0]?.input).toEqual(uploadInput);
    expect(Object.keys(view.refs)).toEqual(['Continuum_app/171@published', 'card/master']);
  });
});
