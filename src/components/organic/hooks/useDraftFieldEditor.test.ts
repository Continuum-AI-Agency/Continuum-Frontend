import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { ApiError } from '@/lib/api/errors';
import type { DraftEditField, PendingDraftEdit } from '@/lib/organic/store';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

type RequestOptions = { path: string; method?: string; body?: Record<string, unknown> };

const requestCalls: RequestOptions[] = [];
let requestImpl: (opts: RequestOptions) => Promise<unknown> = async () => ({});
const request = mock((opts: RequestOptions) => {
  requestCalls.push(opts);
  return requestImpl(opts);
});
const show = mock(() => {});

/**
 * A hand-run store rather than the real Zustand one.
 *
 * `mock.module` is process-wide in bun, and a sibling spec in this directory mocks
 * `@/lib/organic/store` — so a test that reaches for the real store passes alone and
 * fails in a batch depending on load order. The three actions this hook calls are
 * modelled here with their real semantics, which makes these assertions
 * order-independent.
 */
const storeState = {
  draft: null as OrganicCalendarDraft | null,
  pendingDraftEdits: {} as Record<string, PendingDraftEdit>,
  refetchRequests: 0,
};

const updateDraft = (
  draftId: string,
  updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
): void => {
  if (storeState.draft?.id === draftId) storeState.draft = updater(storeState.draft);
};

const markDraftEditPending = (draftId: string, fields: readonly DraftEditField[]): void => {
  const existing = storeState.pendingDraftEdits[draftId];
  storeState.pendingDraftEdits[draftId] = {
    fields: [...new Set([...(existing?.fields ?? []), ...fields])],
    startedAt: existing?.startedAt ?? 0,
  };
};

const clearDraftEditPending = (draftId: string, fields: readonly DraftEditField[]): void => {
  const existing = storeState.pendingDraftEdits[draftId];
  if (!existing) return;
  const settled = new Set(fields);
  const remaining = existing.fields.filter((field) => !settled.has(field));
  if (remaining.length === 0) delete storeState.pendingDraftEdits[draftId];
  else storeState.pendingDraftEdits[draftId] = { ...existing, fields: remaining };
};

mock.module('@/lib/api/http', () => ({ request, http: { request } }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show }) }));
mock.module('@/lib/organic/store', () =>
  createCalendarStoreStub({
    updateDraft,
    markDraftEditPending,
    clearDraftEditPending,
    requestCalendarRefetch: () => {
      storeState.refetchRequests += 1;
    },
  }),
);

// Imported AFTER the module mocks so the hook binds to them.
const { useDraftFieldEditor } = await import('./useDraftFieldEditor');

function draft(over: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'local-1',
    title: 'Draft',
    summary: '',
    timeLabel: '5:00 PM',
    dateLabel: 'Mon, Aug 5',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Reel',
    objective: 'Draft',
    captionPreview: 'original caption',
    tags: [],
    mediaCount: 0,
    origin: 'agent',
    backendDraftId: 'srv-1',
    updatedAt: '2030-08-01T00:00:00.000Z',
    ...over,
  };
}

function seed(slot: OrganicCalendarDraft): void {
  storeState.draft = slot;
  storeState.pendingDraftEdits = {};
  storeState.refetchRequests = 0;
}

function storedDraft(): OrganicCalendarDraft | null {
  return storeState.draft;
}

beforeEach(() => {
  requestCalls.length = 0;
  requestImpl = async () => ({});
  request.mockClear();
  show.mockClear();
});

describe('editField', () => {
  it('writes the store optimistically before the PATCH resolves', async () => {
    let release: (() => void) | null = null;
    requestImpl = () =>
      new Promise((resolve) => {
        release = () => resolve({});
      });
    const target = draft();
    seed(target);

    const { result } = renderHook(() => useDraftFieldEditor(target));

    let pending: Promise<boolean> | null = null;
    act(() => {
      pending = result.current.editField({ format: 'Carousel' }, ['format'], {
        format: 'Carousel',
      });
    });

    // The user sees the new value immediately, while the write is still open.
    expect(storedDraft()?.format).toBe('Carousel');
    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      release?.();
      await pending;
    });
    expect(result.current.isSaving).toBe(false);
  });

  it('PATCHes the brand-scoped field route with the CAS token', async () => {
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    await act(async () => {
      await result.current.editField({ format: 'Carousel' }, ['format'], { format: 'Carousel' });
    });

    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.path).toBe('/api/organic/calendar/drafts/srv-1/fields');
    expect(requestCalls[0]?.method).toBe('PATCH');
    expect(requestCalls[0]?.body?.format).toBe('Carousel');
    expect(requestCalls[0]?.body?.expected_updated_at).toBe('2030-08-01T00:00:00.000Z');
  });

  // The whole point of the hook: an agent-origin draft is the case the old
  // manual-only autosave never wrote at all.
  it('persists an agent-origin draft', async () => {
    const target = draft({ origin: 'agent' });
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    await act(async () => {
      await result.current.editField({ caption: 'agent edit' }, ['caption']);
    });

    expect(requestCalls).toHaveLength(1);
  });

  it('restores the previous value and raises a toast when the PATCH is rejected', async () => {
    requestImpl = async () => {
      throw new ApiError('boom', 500);
    };
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.editField({ format: 'Carousel' }, ['format'], {
        format: 'Carousel',
      });
    });

    expect(ok).toBe(false);
    expect(storedDraft()?.format).toBe('Reel');
    expect(show).toHaveBeenCalled();
    expect(result.current.saveError).not.toBeNull();
  });

  // A 409 means someone else's newer value is on the row. Rolling back would
  // replace their change with an even older one, so reconcile instead.
  it('does NOT roll back on a stale-draft conflict; it requests a refetch', async () => {
    requestImpl = async () => {
      throw new ApiError('stale', 409);
    };
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    await act(async () => {
      await result.current.editField({ format: 'Carousel' }, ['format'], { format: 'Carousel' });
    });

    expect(storedDraft()?.format).toBe('Carousel');
    expect(storeState.refetchRequests).toBe(1);
  });

  it('marks the edited fields pending while in flight and clears them after', async () => {
    let release: (() => void) | null = null;
    requestImpl = () =>
      new Promise((resolve) => {
        release = () => resolve({});
      });
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    let pending: Promise<boolean> | null = null;
    act(() => {
      pending = result.current.editField({ caption: 'x' }, ['caption'], { captionPreview: 'x' });
    });
    expect(storeState.pendingDraftEdits['local-1']?.fields).toEqual(['caption']);

    await act(async () => {
      release?.();
      await pending;
    });
    expect(storeState.pendingDraftEdits['local-1']).toBeUndefined();
  });

  it('adopts the server updated_at so the next edit carries a fresh CAS token', async () => {
    requestImpl = async () => ({ updated_at: '2030-08-02T10:00:00.000Z' });
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    await act(async () => {
      await result.current.editField({ caption: 'x' }, ['caption']);
    });

    expect(storedDraft()?.updatedAt).toBe('2030-08-02T10:00:00.000Z');
  });

  // Nothing to PATCH yet: the autosave inserts the row carrying the local snapshot,
  // so reporting a failure here would be a lie.
  it('reports success without a network call for a draft that has no server row', async () => {
    const target = draft({ backendDraftId: undefined });
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.editField({ caption: 'x' }, ['caption']);
    });

    expect(ok).toBe(true);
    expect(requestCalls).toHaveLength(0);
  });

  it('rejects an invalid patch locally instead of sending it', async () => {
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    await act(async () => {
      await result.current.editField({ caption: 'x'.repeat(3000) }, ['caption']);
    });

    expect(requestCalls).toHaveLength(0);
    expect(result.current.saveError).not.toBeNull();
  });
});

describe('queueFieldEdit', () => {
  it('coalesces a burst of keystrokes into one PATCH carrying the last value', async () => {
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    act(() => {
      result.current.queueFieldEdit({ caption: 'a' }, ['caption'], { captionPreview: 'a' });
      result.current.queueFieldEdit({ caption: 'ab' }, ['caption'], { captionPreview: 'ab' });
      result.current.queueFieldEdit({ caption: 'abc' }, ['caption'], { captionPreview: 'abc' });
    });

    // Every keystroke is visible at once; only the send is deferred.
    expect(storedDraft()?.captionPreview).toBe('abc');
    expect(requestCalls).toHaveLength(0);

    await waitFor(() => expect(requestCalls).toHaveLength(1));
    expect(requestCalls[0]?.body?.caption).toBe('abc');
  });

  it('flush() sends the coalesced edit immediately', async () => {
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    act(() => {
      result.current.queueFieldEdit({ caption: 'typed' }, ['caption'], { captionPreview: 'typed' });
    });
    expect(requestCalls).toHaveLength(0);

    await act(async () => {
      await result.current.flush();
    });

    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.body?.caption).toBe('typed');
  });

  it('flush() is a no-op when nothing is queued', async () => {
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    await act(async () => {
      await result.current.flush();
    });

    expect(requestCalls).toHaveLength(0);
  });

  it('merges different queued fields into one patch rather than dropping either', async () => {
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    act(() => {
      result.current.queueFieldEdit({ caption: 'c' }, ['caption']);
      result.current.queueFieldEdit({ creativeDirection: 'moody' }, ['creativeDirection']);
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.body?.caption).toBe('c');
    expect(requestCalls[0]?.body?.creativeDirection).toBe('moody');
  });
});
