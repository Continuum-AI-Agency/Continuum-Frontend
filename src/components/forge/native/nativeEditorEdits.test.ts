import { expect, test } from 'bun:test';
import type {
  HyperframesOrderView,
  HyperframesSceneView,
  TemplateRevisionVariant,
} from '@continuum/contracts';
import {
  nativeEditorDefaults,
  nativeEditorEdits,
  nativeEditorFormSchema,
  nativeEditorHref,
  nativeOrderDefaults,
  nativeSaveRequest,
  nativeTextFields,
} from './nativeEditorEdits';

const id = (digit: string) =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const view: HyperframesSceneView = {
  family: 'hyperframes',
  brandId: id('1'),
  assetId: id('2'),
  sourceVersionId: id('3'),
  sourceSceneSha256: 'd'.repeat(64),
  revision: {
    templateId: id('2'),
    variantId: id('4'),
    revisionId: id('5'),
    resolvedEditsSha256: 'a'.repeat(64),
  },
  sceneSha256: 'b'.repeat(64),
  viewport: { width: 1920, height: 1080 },
  clock: { numerator: 30, denominator: 1, frameCount: 150 },
  edits: {
    schema: 'hyperframes.edits/1',
    sourceSha256: 'c'.repeat(64),
    operations: [
      { op: 'text', fieldId: 'title.text:0', value: 'Just use' },
      { op: 'style', nodeId: 'title', properties: { color: '#ffffff' } },
      { op: 'order', parentId: 'main', nodeIds: ['logo', 'title'] },
    ],
  },
  capabilities: [
    {
      nodeId: 'title',
      fieldId: 'title.text:0',
      operation: 'text',
      state: 'editable',
      text: {
        value: 'Just use',
        reveal: {
          adapter: 'gsap-prefix/1',
          ticksPerSecond: 10000000,
          checkpoints: [
            { tick: 0, graphemes: 1 },
            { tick: 6700000, graphemes: 8 },
          ],
        },
      },
    },
    {
      nodeId: 'em',
      fieldId: 'em:text',
      operation: 'text',
      state: 'editable',
      text: { value: 'Hyperframes' },
    },
    { nodeId: 'script', fieldId: 'script:text', operation: 'text', state: 'runtime-controlled' },
    { nodeId: 'old', fieldId: 'old:text', operation: 'text', state: 'editable' },
  ],
  renderer: null,
};
const variant: TemplateRevisionVariant = {
  templateId: view.assetId,
  variantId: view.revision.variantId,
  name: 'Portrait',
  original: false,
  parentRevisionId: id('6'),
  draftHeadRevisionId: view.revision.revisionId,
  publishedHeadRevisionId: null,
  archivedAt: null,
  tags: [],
  sourceKind: 'hyperframes',
  revisions: [],
};

test('native copy uses full reveal and individual mixed runs; missing or controlled copy stays read-only', () => {
  expect(nativeTextFields(view).map((field) => field.value)).toEqual(['Just use', 'Hyperframes']);
  expect(nativeEditorDefaults(view).texts).toEqual([
    { fieldId: 'title.text:0', value: 'Just use' },
    { fieldId: 'em:text', value: 'Hyperframes' },
  ]);
  expect(nativeEditorDefaults(view, variant).target).toBe('current');
  expect(nativeEditorDefaults(view, { ...variant, original: true }).target).toBe('new');
  expect(nativeEditorDefaults(view, { ...variant, draftHeadRevisionId: id('7') }).target).toBe(
    'new',
  );
});

test('copy and resize preserve unexposed operations and support saved A/B/A values without duplicate overrides', () => {
  const defaults = nativeEditorDefaults(view);
  expect(nativeEditorEdits(view, defaults)).toEqual(view.edits);
  const changed = structuredClone(defaults);
  changed.texts[0]!.value = '';
  changed.width = 1080;
  changed.height = 1920;
  const edits = nativeEditorEdits(view, changed);
  expect(edits.operations).toEqual([
    view.edits.operations[1],
    view.edits.operations[2],
    { op: 'text', fieldId: 'title.text:0', value: '' },
    { op: 'viewport', width: 1080, height: 1920 },
  ]);
  const b: HyperframesSceneView = {
    ...view,
    viewport: { width: 1080, height: 1920 },
    edits,
    capabilities: view.capabilities.map((capability) =>
      capability.fieldId === 'title.text:0' ? { ...capability, text: { value: '' } } : capability,
    ),
  };
  const restore = nativeEditorEdits(b, defaults);
  expect(restore.operations.filter((op) => op.op === 'text')).toEqual([
    { op: 'text', fieldId: 'title.text:0', value: 'Just use' },
  ]);
  expect(restore.operations.filter((op) => op.op === 'viewport')).toEqual([
    { op: 'viewport', width: 1920, height: 1080 },
  ]);
  expect(view.edits.operations).toHaveLength(3);
});

test('native save binds source and parent, requires a live head for updates, and branches old revisions', () => {
  const request = nativeSaveRequest(
    view,
    variant,
    nativeEditorDefaults(view, variant),
    'retry-identity',
  );
  expect(request).toMatchObject({
    parentRevisionId: view.revision.revisionId,
    expectedParentSceneSha256: view.sceneSha256,
    expectedSourceSceneSha256: view.sourceSceneSha256,
    expectedHeadRevisionId: view.revision.revisionId,
    variantId: variant.variantId,
    idempotencyKey: 'retry-identity',
  });
  expect(() =>
    nativeSaveRequest(
      view,
      { ...variant, draftHeadRevisionId: id('7') },
      nativeEditorDefaults(view, variant),
      'retry',
    ),
  ).toThrow('no longer');
  expect(() =>
    nativeSaveRequest(
      { ...view, sourceSceneSha256: null },
      variant,
      nativeEditorDefaults(view),
      'retry',
    ),
  ).toThrow('older upload');
  const branch = nativeSaveRequest(
    view,
    { ...variant, draftHeadRevisionId: id('7') },
    nativeEditorDefaults(view),
    'branch',
  );
  expect(branch.variantId).toBeUndefined();
  expect(branch.expectedHeadRevisionId).toBeNull();
  expect(branch.parentRevisionId).toBe(view.revision.revisionId);
});

test('an uploaded child uses its own source baseline rather than the family Original', () => {
  const child = {
    ...view,
    sourceVersionId: id('8'),
    sourceSceneSha256: 'e'.repeat(64),
    edits: { ...view.edits, sourceSha256: 'f'.repeat(64) },
  };
  const request = nativeSaveRequest(
    child,
    variant,
    nativeEditorDefaults(child, variant),
    'uploaded-child-edit',
  );
  expect(request.expectedSourceSceneSha256).toBe(child.sourceSceneSha256);
  expect(request.edits.sourceSha256).toBe(child.edits.sourceSha256);
  expect(request.parentRevisionId).toBe(child.revision.revisionId);
});

test('changed field inventories, excessive geometry and malformed copy fail before save; links carry durable pins', () => {
  const defaults = nativeEditorDefaults(view);
  expect(() =>
    nativeEditorEdits(view, { ...defaults, texts: [defaults.texts[0]!, defaults.texts[0]!] }),
  ).toThrow('fields changed');
  expect(nativeEditorFormSchema.safeParse({ ...defaults, width: 8192, height: 8192 }).success).toBe(
    false,
  );
  expect(
    nativeEditorFormSchema.safeParse({
      ...defaults,
      texts: [{ fieldId: 'title.text:0', value: 'x'.repeat(65537) }],
    }).success,
  ).toBe(false);
  const url = new URL(
    nativeEditorHref(view.brandId, view.assetId, view.revision.revisionId, id('9')),
    'https://app.test',
  );
  expect(url.pathname).toBe(`/forge/native/${view.assetId}`);
  expect(Object.fromEntries(url.searchParams)).toEqual({
    brandId: view.brandId,
    revisionId: view.revision.revisionId,
    jobId: id('9'),
  });
});

const order: HyperframesOrderView = {
  schema: 'hyperframes.order-view/1',
  brandId: view.brandId,
  assetId: view.assetId,
  revisionId: view.revision.revisionId,
  sceneSha256: view.sceneSha256,
  sourceVersionId: view.sourceVersionId,
  sourceSceneSha256: view.sourceSceneSha256!,
  sourceSha256: view.edits.sourceSha256,
  groups: [
    {
      parentId: 'root',
      parentTag: 'div',
      children: [
        { nodeId: 'first', tag: 'div' },
        { nodeId: 'second', tag: 'div' },
      ],
    },
  ],
};

test('source order snapshots preserve unexposed edits, combine copy/size, and restore A/B/A without duplicates', () => {
  const original = {
    ...view,
    edits: {
      ...view.edits,
      operations: [
        ...view.edits.operations,
        { op: 'order' as const, parentId: 'root', nodeIds: ['first', 'second'] },
      ],
    },
  };
  const defaults = { ...nativeEditorDefaults(original), orders: nativeOrderDefaults(order) };
  expect(nativeEditorEdits(original, defaults, order)).toEqual(original.edits);
  const changed = structuredClone(defaults);
  changed.orders[0]!.nodeIds.reverse();
  changed.texts[0]!.value = 'New copy';
  changed.width = 1600;
  const edits = nativeEditorEdits(original, changed, order);
  expect(edits.operations.filter((op) => op.op === 'order')).toEqual([
    ...view.edits.operations.filter((op) => op.op === 'order'),
    { op: 'order', parentId: 'root', nodeIds: ['second', 'first'] },
  ]);
  expect(edits.operations.some((op) => op.op === 'text' && op.value === 'New copy')).toBe(true);
  expect(edits.operations.some((op) => op.op === 'viewport' && op.width === 1600)).toBe(true);
  const b = { ...original, edits };
  const bOrder = {
    ...order,
    groups: [{ ...order.groups[0]!, children: [...order.groups[0]!.children].reverse() }],
  };
  const restore = nativeEditorEdits(
    b,
    { ...nativeEditorDefaults(b), orders: defaults.orders },
    bOrder,
  );
  expect(restore.operations.filter((op) => op.op === 'order')).toEqual([
    ...view.edits.operations.filter((op) => op.op === 'order'),
    { op: 'order', parentId: 'root', nodeIds: ['first', 'second'] },
  ]);
  expect(original.edits.operations.at(-1)).toEqual({
    op: 'order',
    parentId: 'root',
    nodeIds: ['first', 'second'],
  });
});

test('order metadata and form inventories must name every pinned child exactly once', () => {
  const defaults = { ...nativeEditorDefaults(view), orders: nativeOrderDefaults(order) };
  for (const nodeIds of [['first'], ['first', 'first'], ['first', 'foreign']]) {
    expect(() =>
      nativeEditorEdits(view, { ...defaults, orders: [{ parentId: 'root', nodeIds }] }, order),
    ).toThrow();
  }
  expect(() => nativeEditorEdits(view, { ...defaults, orders: [] }, order)).toThrow(
    'order changed',
  );
  expect(() =>
    nativeEditorEdits(
      view,
      { ...defaults, orders: [...defaults.orders, ...defaults.orders] },
      order,
    ),
  ).toThrow('order changed');
  expect(() => nativeEditorEdits(view, defaults)).toThrow('order changed');
  expect(() =>
    nativeEditorEdits(view, defaults, { ...order, sceneSha256: '0'.repeat(64) }),
  ).toThrow('order changed');
});
