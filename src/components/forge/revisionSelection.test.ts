import { expect, test } from 'bun:test';
import type { TemplateRevisionVariant } from '@continuum/contracts';
import { revisionIsReadOnly, selectTemplateRevision } from './revisionSelection';

const variants = [
  {
    variantId: 'original',
    original: true,
    draftHeadRevisionId: 'r1',
    revisions: [{ id: 'r1', sourceAssetId: 'file', sourceVersionId: 'v1' }],
  },
  {
    variantId: 'tall',
    original: false,
    draftHeadRevisionId: 'r3',
    revisions: [
      { id: 'r2', sourceAssetId: 'file', sourceVersionId: 'v1' },
      { id: 'r3', sourceAssetId: 'file', sourceVersionId: 'v1' },
    ],
  },
] as TemplateRevisionVariant[];
test('reused bytes require a revision identity and never imply the first matching branch', () => {
  expect(selectTemplateRevision(variants, 'file', 'v1')).toBeUndefined();
  const head = selectTemplateRevision(variants, 'file', 'v1', 'r3')!;
  expect(head.variant.variantId).toBe('tall');
  expect(head.revision.id).toBe('r3');
  expect(revisionIsReadOnly(head)).toBe(false);
  expect(revisionIsReadOnly(selectTemplateRevision(variants, 'file', 'v1', 'r2')!)).toBe(true);
  expect(revisionIsReadOnly(selectTemplateRevision(variants, 'file', 'v1', 'r1')!)).toBe(true);
  expect(selectTemplateRevision(variants, 'file', 'v1', 'missing')).toBeUndefined();
});
