import { afterEach, describe, expect, mock, test } from 'bun:test';
import { type PresentationCommand, presentationDocumentSchema } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import type { OperationJournalState, OperationJournalStorage } from '../templateOperationJournal';

const records = new Map<string, OperationJournalState>();
const ownerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let owner = ownerA;
let sessionOwner: string | null = null;
let storageFailure = false;
const authListeners = new Set<(event: string, session: { user: { id: string } }) => void>();
const storage: OperationJournalStorage = {
  async change<T>(key: string, update: (value: OperationJournalState) => T): Promise<T> {
    if (storageFailure) throw new Error('Private storage quota exceeded');
    const value = structuredClone(
      records.get(key) ?? {
        workingCopyId: crypto.randomUUID(),
        sequence: 0,
        events: [],
        acknowledged: [],
        outbox: null,
      },
    );
    const result = update(value);
    records.set(key, value);
    return result;
  },
};
mock.module('@/lib/library/templateSources', () => ({
  fetchTemplateAuthoringUserId: async () => owner,
  appendTemplateAuthoringHistory: async () => {},
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: sessionOwner ?? owner },
            access_token: `fixture-${sessionOwner ?? owner}`,
          },
        },
      }),
      onAuthStateChange: (callback: (event: string, session: { user: { id: string } }) => void) => {
        authListeners.add(callback);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
      },
    },
  }),
}));

const doc = presentationDocumentSchema.parse({
  schemaVersion: 1,
  id: 'deck',
  title: 'Deck',
  revision: 100,
  engineVersion: 'fixture',
  source: {
    assetId: '22222222-2222-4222-8222-222222222222',
    assetVersionId: '33333333-3333-4333-8333-333333333333',
    checksum: 'a'.repeat(64),
  },
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
    draftRevision: _revision + 1,
  }),
);
mock.module('@/lib/api/presentations.client', () => ({ presentationsApi: { load, apply: write } }));
mock.module('@/lib/api/http', () => ({
  http: {
    request: async (input: {
      body: {
        brandId: string;
        baseVersionId: string;
        expectedRevision: number;
        commands: PresentationCommand[];
        retryId: string;
      };
    }) => write(scope, input.body.expectedRevision, input.body.commands, input.body.retryId),
  },
}));
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

const scope = {
  brandId: '11111111-1111-4111-8111-111111111111',
  assetId: '22222222-2222-4222-8222-222222222222',
  baseVersionId: '33333333-3333-4333-8333-333333333333',
};
afterEach(() => {
  cleanup();
  load.mockClear();
  write.mockReset();
  write.mockImplementation(async (_scope, revision) => ({
    document: { ...doc, revision: 101 },
    draftRevision: revision + 1,
  }));
  records.clear();
  owner = ownerA;
  sessionOwner = null;
  storageFailure = false;
  load.mockImplementation(async () => ({ document: doc, draftRevision: 7 }));
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePresentationDocument(scope, undefined, { storage }), { wrapper });
}
const command: PresentationCommand = {
  type: 'slide.notes',
  slideId: 'slide-a',
  notes: 'Speaker notes',
};

describe('usePresentationDocument', () => {
  test('unsaved edits survive remount before any Save request', async () => {
    const first = mount();
    await waitFor(() => expect(first.result.current.document).not.toBeNull());
    await act(async () => {
      await first.result.current.perform([command]);
    });
    expect(first.result.current.document?.revision).toBe(101);
    first.unmount();
    const reopened = mount();
    await waitFor(() => expect(reopened.result.current.document).not.toBeNull());
    expect(reopened.result.current.document?.revision).toBe(101);
    expect(reopened.result.current.dirty).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(
      [...records.values()]
        .flatMap((row) => row.events)
        .every((event) => event.baseRevisionId === null),
    ).toBe(true);
  });
  test('rapid commands use the latest durable projection rather than one render closure', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    const later = { ...command, notes: 'Second queued command' };
    await act(async () => {
      const first = view.result.current.perform([command]);
      const second = view.result.current.perform([later]);
      expect(await first).toBe(true);
      expect(await second).toBe(true);
    });
    expect(view.result.current.document?.revision).toBe(102);
    await act(async () => {
      expect(await view.result.current.save()).toBe(true);
    });
    expect(write.mock.calls[0][2]).toEqual([command, later]);
  });
  test('a lost Save response retains its exact request across reload even when GET recovers accepted state', async () => {
    const accepted = { document: { ...doc, revision: 101 }, draftRevision: 8 };
    write.mockImplementationOnce(async () => {
      load.mockImplementation(async () => accepted);
      throw new Error('Accepted response disconnected');
    });
    const first = mount();
    await waitFor(() => expect(first.result.current.document).not.toBeNull());
    await act(async () => {
      await first.result.current.perform([command]);
    });
    await act(async () => {
      expect(await first.result.current.save()).toBe(false);
    });
    first.unmount();
    const reopened = mount();
    await waitFor(() => expect(reopened.result.current.document).not.toBeNull());
    expect(reopened.result.current.document?.revision).toBe(101);
    await act(async () => {
      expect(await reopened.result.current.save()).toBe(true);
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
  });
  test('edits arriving while Save is in flight remain dirty and save against its accepted draft revision', async () => {
    let finish!: (value: { document: typeof doc; draftRevision: number }) => void;
    write.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    await act(async () => {
      await view.result.current.perform([command]);
    });
    let saving!: Promise<boolean>;
    await act(async () => {
      saving = view.result.current.save();
    });
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const later = { ...command, notes: 'Later edit' };
    await act(async () => {
      expect(await view.result.current.perform([later])).toBe(true);
    });
    await act(async () => {
      finish({ document: { ...doc, revision: 101 }, draftRevision: 8 });
      await saving;
    });
    expect(view.result.current.dirty).toBe(true);
    await act(async () => {
      await view.result.current.save();
    });
    expect(write.mock.calls[1][1]).toBe(8);
    expect(write.mock.calls[1][2]).toEqual([later]);
  });
  test('an account switch cannot send the previous owner pending changes', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    await act(async () => {
      await view.result.current.perform([command]);
    });
    owner = ownerB;
    await act(async () => {
      expect(await view.result.current.save()).toBe(false);
    });
    expect(write).not.toHaveBeenCalled();
    view.unmount();
    owner = ownerA;
    const reopened = mount();
    await waitFor(() => expect(reopened.result.current.document).not.toBeNull());
    expect(reopened.result.current.dirty).toBe(true);
  });
  test('authentication changes hide the previous account projection and keep it privately recoverable', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    await act(async () => {
      await view.result.current.perform([command]);
    });
    await act(async () => {
      owner = ownerB;
      for (const listener of authListeners) listener('SIGNED_IN', { user: { id: ownerB } });
    });
    await waitFor(() => expect(view.result.current.document?.revision).toBe(100));
    expect(view.result.current.dirty).toBe(false);
    await act(async () => {
      owner = ownerA;
      for (const listener of authListeners) listener('SIGNED_IN', { user: { id: ownerA } });
    });
    await waitFor(() => expect(view.result.current.document?.revision).toBe(101));
    expect(view.result.current.dirty).toBe(true);
  });
  test('the HTTP boundary refuses a different session after a Save intent was durably captured', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    await act(async () => {
      await view.result.current.perform([command]);
    });
    sessionOwner = ownerB;
    await act(async () => {
      expect(await view.result.current.save()).toBe(false);
    });
    expect(write).not.toHaveBeenCalled();
    const intent = [...records.values()]
      .map((row) => row.projection as { pending?: { id: string } })
      .find((row) => row.pending)?.pending;
    expect(intent?.id).toBeString();
    view.unmount();
    sessionOwner = null;
    const reopened = mount();
    await waitFor(() => expect(reopened.result.current.document).not.toBeNull());
    await act(async () => {
      expect(await reopened.result.current.save()).toBe(true);
    });
    expect(write.mock.calls[0][3]).toBe(intent?.id);
  });
  test('a failed local persistence transaction leaves the previously visible document unchanged', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    storageFailure = true;
    await act(async () => {
      expect(await view.result.current.perform([command])).toBe(false);
    });
    expect(view.result.current.document?.revision).toBe(100);
    expect(view.result.current.error).toContain('quota');
  });
  test('a delayed server adoption cannot replace newer private edits', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    await act(async () => {
      await view.result.current.perform([command]);
    });
    await act(async () => {
      view.result.current.adopt({ document: { ...doc, revision: 200 }, draftRevision: 8 });
    });
    await waitFor(() => expect(view.result.current.error ?? '').toContain('private edits'));
    expect(view.result.current.document?.revision).toBe(101);
    expect(view.result.current.dirty).toBe(true);
    view.unmount();
    const reopened = mount();
    await waitFor(() => expect(reopened.result.current.document?.revision).toBe(101));
    expect(reopened.result.current.dirty).toBe(true);
  });
  test('server adoption verifies the existing source and engine pins', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.document).not.toBeNull());
    await act(async () => {
      view.result.current.adopt({
        document: { ...doc, engineVersion: 'another-engine' },
        draftRevision: 8,
      });
    });
    await waitFor(() => expect(view.result.current.error ?? '').toContain('source or engine'));
    expect(view.result.current.document?.engineVersion).toBe('fixture');
    expect(view.result.current.document?.revision).toBe(100);
  });
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
  test('local undo and redo survive remount and discard retains their operation evidence', async () => {
    const first = mount();
    await waitFor(() => expect(first.result.current.document).not.toBeNull());
    await act(async () => {
      await first.result.current.perform([command]);
    });
    await act(async () => {
      await first.result.current.perform([{ ...command, notes: 'Second' }]);
    });
    await act(async () => {
      await first.result.current.history('undo');
    });
    first.unmount();
    const reopened = mount();
    await waitFor(() => expect(reopened.result.current.document?.revision).toBe(101));
    expect(reopened.result.current.canRedoLocal).toBe(true);
    await act(async () => {
      await reopened.result.current.history('redo');
    });
    expect(reopened.result.current.document?.revision).toBe(102);
    await act(async () => {
      reopened.result.current.discard();
    });
    await waitFor(() => expect(reopened.result.current.document?.revision).toBe(100));
    const events = [...records.values()].flatMap((row) => row.events);
    expect(events.map((event) => event.command)).toEqual([
      'forge_presentation_edit',
      'forge_presentation_edit',
      'forge_presentation_undo',
      'forge_presentation_redo',
      'forge_presentation_discard',
    ]);
    expect(write).not.toHaveBeenCalled();
  });
});
