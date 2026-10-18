import { afterEach, describe, expect, mock, test } from 'bun:test';
import { type PresentationCommand, presentationDocumentSchema } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';

const doc = presentationDocumentSchema.parse({
  schemaVersion: 1,
  id: 'deck',
  title: 'Deck',
  revision: 100,
  engineVersion: 'fixture',
  source: null,
  nativeDocument: 'native',
  size: { width: 720, height: 405 },
  slides: [{ id: 'slide-a', title: 'Intro', layoutId: null, notes: '', objects: [] }],
  fields: [],
  diagnostics: [],
  capabilities: {},
});
const load = mock(async () => ({ document: doc, draftRevision: 7 }));
const write = mock(
  async (_scope: unknown, _revision: number, _commands: PresentationCommand[], _retry: string) => ({
    document: { ...doc, revision: 101 },
    draftRevision: 8,
  }),
);
mock.module('@/lib/api/presentations.client', () => ({ presentationsApi: { load, apply: write } }));
mock.module('./presentationEngine', () => ({
  PresentationEngine: class {
    async process(request: { document: typeof doc }) {
      return {
        ok: true,
        document: { ...request.document, revision: request.document.revision + 1 },
      };
    }
    dispose() {}
  },
}));

import { usePresentationDocument } from './usePresentationDocument';

const scope = { brandId: 'brand', assetId: 'source', baseVersionId: 'source-version' };
afterEach(() => {
  cleanup();
  load.mockClear();
  write.mockReset();
  write.mockImplementation(async () => ({ document: { ...doc, revision: 101 }, draftRevision: 8 }));
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePresentationDocument(scope), { wrapper });
}
const command: PresentationCommand = {
  type: 'slide.notes',
  slideId: 'slide-a',
  notes: 'Speaker notes',
};

describe('usePresentationDocument', () => {
  test('saves against the server draft revision rather than the internal engine revision', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    await act(async () => {
      await view.result.current.perform([command]);
    });
    expect(view.result.current.document?.revision).toBe(101);
    await act(async () => {
      expect(await view.result.current.save()).toBe(true);
    });
    expect(write.mock.calls[0][1]).toBe(7);
    expect(write.mock.calls[0][0]).toEqual(scope);
    expect(view.result.current.dirty).toBe(false);
  });
  test('failed saves retain local edits and retry the same request identity', async () => {
    write.mockImplementationOnce(async () => {
      throw new Error('Network disconnected');
    });
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    await act(async () => {
      await view.result.current.perform([command]);
    });
    await act(async () => {
      expect(await view.result.current.save()).toBe(false);
    });
    expect(view.result.current.dirty).toBe(true);
    expect(view.result.current.error).toBe('Network disconnected');
    await act(async () => {
      expect(await view.result.current.save()).toBe(true);
    });
    expect(write.mock.calls[0][3]).toBe(write.mock.calls[1][3]);
    expect(write.mock.calls[0][2]).toEqual(write.mock.calls[1][2]);
  });
  test('undo and redo restore local snapshots without writing the source', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    await act(async () => {
      await view.result.current.perform([command]);
    });
    expect(view.result.current.dirty).toBe(true);
    await act(async () => {
      await view.result.current.history('undo');
    });
    expect(view.result.current.dirty).toBe(false);
    expect(view.result.current.document?.revision).toBe(100);
    await act(async () => {
      await view.result.current.history('redo');
    });
    expect(view.result.current.dirty).toBe(true);
    expect(view.result.current.document?.revision).toBe(101);
    expect(write).not.toHaveBeenCalled();
  });
});
