import { describe, expect, it } from 'bun:test';
import { adoptLiveDocuments } from '../documentRows';
import { intakeDocumentsProcessing, readyIntakeDocuments } from '../intake';
import { createDefaultOnboardingState, type OnboardingDocument } from '../state';

// Prod, 2026-11-23 (Alcaldía de Cali signups): an upload saves its document as `processing`, the
// ingest finishes in ~2 s, and only Realtime says so. The wizard's copy never heard it, so
// "Reading brand materials…" held Continue until the user reloaded.
const uploaded: OnboardingDocument = {
  id: 'doc-1',
  name: 'brand-manual.pdf',
  source: 'upload',
  createdAt: '2026-11-23T20:00:00.000Z',
  status: 'processing',
  progressStep: 'uploading',
  progressPercent: 100,
};

describe('adoptLiveDocuments', () => {
  it('releases the Continue gate once the live list says the upload is ready', () => {
    const state = { ...createDefaultOnboardingState(), documents: [uploaded] };
    expect(intakeDocumentsProcessing(state)).toBe(true);

    const documents = adoptLiveDocuments(state.documents, [
      { ...uploaded, status: 'ready', progressStep: 'ready', pageCount: 12 },
    ]);

    expect(intakeDocumentsProcessing({ ...state, documents })).toBe(false);
    expect(readyIntakeDocuments({ ...state, documents }).map((doc) => doc.id)).toEqual(['doc-1']);
    expect(documents[0]).toMatchObject({ status: 'ready', progressStep: 'ready', pageCount: 12 });
  });

  it('adopts a watchdog timeout, so a dead ingest stops holding Continue too', () => {
    const [doc] = adoptLiveDocuments(
      [uploaded],
      [
        {
          ...uploaded,
          status: 'error',
          progressStep: 'error',
          errorMessage: 'Processing timed out.',
        },
      ],
    );
    expect(doc).toMatchObject({ status: 'error', errorMessage: 'Processing timed out.' });
  });

  it('returns the same array when nothing the wizard reads has changed', () => {
    const documents = [uploaded];
    expect(adoptLiveDocuments(documents, [{ ...uploaded }])).toBe(documents);
    expect(adoptLiveDocuments(documents, [])).toBe(documents);
  });

  it('never adds a document the wizard does not already hold', () => {
    const other = { ...uploaded, id: 'doc-2', status: 'ready' as const };
    expect(adoptLiveDocuments([uploaded], [other])).toEqual([uploaded]);
  });
});
