import { expect, test } from 'bun:test';
import { type BrandDocumentRow, reconcileDocuments } from './documentRows';
import { readyIntakeDocuments } from './intake';
import {
  createDefaultOnboardingState,
  mergeOnboardingState,
  type OnboardingDocument,
} from './state';

const row = (id: string, patch: Partial<BrandDocumentRow> = {}): BrandDocumentRow => ({
  id,
  brand_id: 'brand-1',
  name: `${id}.pdf`,
  status: 'ready',
  error_message: null,
  type: null,
  source: 'upload',
  created_at: '2026-10-10T00:00:00Z',
  updated_at: null,
  retention: 'permanent',
  expires_at: null,
  archived_at: null,
  ...patch,
});
const stateDoc = (id: string): OnboardingDocument => ({
  id,
  name: `${id}.pdf`,
  source: 'upload',
  status: 'ready',
  createdAt: '2026-10-10T00:00:00.000Z',
});

test('a document archived in Knowledge leaves the onboarding list and the intake evidence', () => {
  const before = [stateDoc('kept'), stateDoc('archived')];
  const { documents, dirty } = reconcileDocuments(before, [
    row('kept'),
    row('archived', { archived_at: '2026-10-11T00:00:00Z' }),
  ]);
  expect(dirty).toBe(true);
  expect(documents.map((doc) => doc.id)).toEqual(['kept']);
  const state = mergeOnboardingState(createDefaultOnboardingState(), { documents });
  expect(readyIntakeDocuments(state).map((doc) => doc.id)).toEqual(['kept']);
});

test('an archived row is not re-added to the list, a restored one is', () => {
  const archived = row('doc', { archived_at: '2026-10-11T00:00:00Z' });
  expect(reconcileDocuments([], [archived])).toEqual({ documents: [], dirty: false });
  const restored = reconcileDocuments([], [{ ...archived, archived_at: null }]);
  expect(restored.documents.map((doc) => doc.id)).toEqual(['doc']);
  expect(restored.dirty).toBe(true);
});

test('retention and expiry come from the row so temporary and expired documents are excluded', () => {
  const { documents } = reconcileDocuments(
    [],
    [
      row('temporary', { retention: 'ephemeral' }),
      row('expired', { expires_at: '2026-10-12T00:00:00+00:00' }),
      row('live'),
    ],
  );
  const state = mergeOnboardingState(createDefaultOnboardingState(), { documents });
  expect(readyIntakeDocuments(state, Date.parse('2026-10-20T00:00:00Z')).map((d) => d.id)).toEqual([
    'live',
  ]);
});

test('an unchanged list is not reported dirty, so a plain load writes nothing', () => {
  const { dirty } = reconcileDocuments([stateDoc('a')], [row('a')]);
  expect(dirty).toBe(false);
});

test('a document with no row is kept as it was', () => {
  const { documents, dirty } = reconcileDocuments([stateDoc('local')], []);
  expect(documents.map((doc) => doc.id)).toEqual(['local']);
  expect(dirty).toBe(false);
});
