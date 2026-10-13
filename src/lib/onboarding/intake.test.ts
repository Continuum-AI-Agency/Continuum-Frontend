import { expect, test } from 'bun:test';
import { intakeInputKey, readyIntakeDocuments } from './intake';
import { mapOnboardingStateToAgentPayload } from './mapping';
import { resumeScreenFor } from './resumeScreen';
import { createDefaultOnboardingState, mergeOnboardingState, repairOnboardingState } from './state';

const intake = {
  kind: 'description' as const,
  brand_name: 'Acme',
  url: null,
  description: 'Solar installation for local homes.',
};
const state = () =>
  mergeOnboardingState(createDefaultOnboardingState(), { intake, brand: { name: 'Acme' } });
const document = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Brand guide',
  source: 'upload' as const,
  status: 'ready' as const,
  createdAt: '2026-10-10T00:00:00Z',
  version: 1,
};

test('original input survives generated overview changes, merges, and state repair', () => {
  const next = mergeOnboardingState(state(), { brand: { overview: 'A generated summary.' } });
  expect(next.intake?.description).toBe(intake.description);
  expect(
    mapOnboardingStateToAgentPayload('brand-1', 'user-1', state()).brandProfile.description,
  ).toBe(intake.description);
  expect(mapOnboardingStateToAgentPayload('brand-1', 'user-1', next).brandProfile.description).toBe(
    'A generated summary.',
  );
  expect(repairOnboardingState({ ...next, step: -10 }).state.intake).toEqual(intake);
  const approved = mapOnboardingStateToAgentPayload(
    'brand-1',
    'user-1',
    mergeOnboardingState(next, {
      previewRequest: { inputKey: 'input:test', runId: '00000000-0000-4000-8000-000000000009' },
    }),
  );
  expect(approved.intake).toEqual(intake);
  expect(approved.preview_run_id).toBe('00000000-0000-4000-8000-000000000009');
});
test('resume never requires a website and document-only intake waits for readable content', () => {
  expect(resumeScreenFor(state(), false)).toBe(1);
  expect(
    resumeScreenFor(
      mergeOnboardingState(state(), {
        step: 1,
        brand: { overview: 'Background DNA already generated' },
      }),
      true,
    ),
  ).toBe(1);
  const documents = mergeOnboardingState(state(), {
    step: 5,
    intake: { ...intake, kind: 'documents', description: null },
    documents: [{ ...document, status: 'processing' }],
  });
  expect(resumeScreenFor(documents, true)).toBe(1);
  expect(readyIntakeDocuments(documents)).toHaveLength(0);
});
test('cache identity follows original input and document versions, not generated prose', async () => {
  const base = state();
  expect(
    await intakeInputKey(mergeOnboardingState(base, { brand: { overview: 'Generated summary' } })),
  ).toBe(await intakeInputKey(base));
  expect(
    await intakeInputKey(
      mergeOnboardingState(base, { intake: { ...intake, description: 'Different business' } }),
    ),
  ).not.toBe(await intakeInputKey(base));
  const one = mergeOnboardingState(base, { documents: [document] });
  const two = mergeOnboardingState(base, { documents: [{ ...document, version: 2 }] });
  expect(await intakeInputKey(one)).not.toBe(await intakeInputKey(two));
  expect(
    readyIntakeDocuments(
      mergeOnboardingState(base, { documents: [{ ...document, archivedAt: document.createdAt }] }),
    ),
  ).toHaveLength(0);
});
