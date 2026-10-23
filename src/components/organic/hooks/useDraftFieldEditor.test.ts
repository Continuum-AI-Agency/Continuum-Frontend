import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { CAPTION_MAX_ANY_PLATFORM } from '@continuum/contracts';
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
  writes: 0,
};

const updateDraft = (
  draftId: string,
  updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
): void => {
  const card = storeState.draft;
  if (!card) return;
  if (card.id === draftId) {
    storeState.draft = updater(card);
    storeState.writes += 1;
    return;
  }
  // A group's member rows live on the card, as in the real store.
  if (!card.groupMembers?.some((member) => member.draft?.id === draftId)) return;
  storeState.draft = {
    ...card,
    groupMembers: card.groupMembers.map((member) =>
      member.draft?.id === draftId ? { ...member, draft: updater(member.draft) } : member,
    ),
  };
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
    get days() {
      return storeState.draft ? [{ id: 'day-1', slots: [storeState.draft] }] : [];
    },
    updateDraft,
    markDraftEditPending,
    clearDraftEditPending,
    requestCalendarRefetch: () => {
      storeState.refetchRequests += 1;
    },
  }),
);

// Imported AFTER the module mocks so the hook binds to them.
const { useDraftFieldEditor, useDraftFieldPersistence } = await import('./useDraftFieldEditor');

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
  storeState.writes = 0;
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

  // C5: a group is one post, so its time moves every member row, each with its own token.
  it('moves every member of a group when the time changes, each against its own row', async () => {
    const member = draft({ id: 'local-1::tiktok', backendDraftId: 'srv-tt', updatedAt: 'T-tt' });
    const target = draft({
      groupMembers: [
        { backendDraftId: 'srv-1', platform: 'instagram', status: 'draft', accountId: null },
        {
          backendDraftId: 'srv-tt',
          platform: 'tiktok',
          status: 'draft',
          accountId: null,
          draft: member,
        },
      ],
    });
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    await act(async () => {
      await result.current.editField({ dayId: '2030-08-06', timeOfDay: '13:00' }, ['schedule'], {
        timeLabel: '1:00 PM',
      });
    });

    expect(requestCalls.map((call) => call.path).sort()).toEqual([
      '/api/organic/calendar/drafts/srv-1/fields',
      '/api/organic/calendar/drafts/srv-tt/fields',
    ]);
    const tt = requestCalls.find((call) => call.path.includes('srv-tt'));
    expect(tt?.body).toMatchObject({
      dayId: '2030-08-06',
      timeOfDay: '13:00',
      expected_updated_at: 'T-tt',
    });
  });

  it('puts the moved rows back when one member cannot move, so the platforms never split', async () => {
    requestImpl = async (call) => {
      if (call.path.includes('srv-tt')) throw new ApiError('boom', 500);
      return { updated_at: 'T-new' };
    };
    const member = draft({ id: 'local-1::tiktok', backendDraftId: 'srv-tt', updatedAt: 'T-tt' });
    const target = draft({
      timeLabel: '5:00 PM',
      groupMembers: [
        { backendDraftId: 'srv-1', platform: 'instagram', status: 'draft', accountId: null },
        {
          backendDraftId: 'srv-tt',
          platform: 'tiktok',
          status: 'draft',
          accountId: null,
          draft: member,
        },
      ],
    });
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.editField(
        { dayId: '2030-08-06', timeOfDay: '13:00' },
        ['schedule'],
        {
          timeLabel: '1:00 PM',
        },
      );
    });

    expect(ok).toBe(false);
    const cardWrites = requestCalls.filter((call) => call.path.includes('srv-1'));
    expect(cardWrites.map((call) => call.body?.timeOfDay)).toEqual(['13:00', '17:00']);
    expect(storedDraft()?.timeLabel).toBe('5:00 PM');
  });

  it('a caption edit on a group card stays on the card row', async () => {
    const target = draft({
      groupMembers: [
        { backendDraftId: 'srv-1', platform: 'instagram', status: 'draft', accountId: null },
        {
          backendDraftId: 'srv-tt',
          platform: 'tiktok',
          status: 'draft',
          accountId: null,
          draft: draft({ id: 'x', backendDraftId: 'srv-tt' }),
        },
      ],
    });
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));
    await act(async () => {
      await result.current.editField({ caption: 'card only' }, ['caption']);
    });
    expect(requestCalls.map((call) => call.path)).toEqual([
      '/api/organic/calendar/drafts/srv-1/fields',
    ]);
  });

  // A platform ticked before the caption was typed copied an empty row, and that row's readiness
  // refused the whole group's publish — Instagram included.
  it('gives an empty group row the caption, and keeps it following the bursts it was given', async () => {
    const facebook = draft({
      id: 'local-1::facebook',
      backendDraftId: 'srv-fb',
      updatedAt: 'T-fb',
      platforms: ['facebook'],
      captionPreview: '',
    });
    const target = draft({
      captionPreview: '',
      groupMembers: [
        { backendDraftId: 'srv-1', platform: 'instagram', status: 'draft', accountId: null },
        {
          backendDraftId: 'srv-fb',
          platform: 'facebook',
          status: 'draft',
          accountId: null,
          draft: facebook,
        },
      ],
    });
    seed(target);
    requestImpl = async () => ({ updated_at: 'T-next' });
    const { result } = renderHook(() => useDraftFieldEditor(target));

    await act(async () => {
      await result.current.editField({ caption: 'La' }, ['caption'], { captionPreview: 'La' });
    });
    await act(async () => {
      await result.current.editField({ caption: 'La alineación' }, ['caption'], {
        captionPreview: 'La alineación',
      });
    });

    const facebookWrites = requestCalls.filter((call) => call.path.includes('srv-fb'));
    expect(facebookWrites.map((call) => call.body?.caption)).toEqual(['La', 'La alineación']);
    expect(facebookWrites[0]?.body?.expected_updated_at).toBe('T-fb');
    expect(
      storedDraft()?.groupMembers?.find((member) => member.platform === 'facebook')?.draft
        ?.captionPreview,
    ).toBe('La alineación');
  });

  // One caption rule: the route refuses an over-limit caption and names the limit; never truncate.
  it("shows the route's own reason for a refused edit", async () => {
    const message = 'LinkedIn captions are at most 3000 characters — this one is 3001';
    requestImpl = async () => {
      throw new ApiError(message, 422, undefined, { error: 'caption_too_long', message });
    };
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    await act(async () => {
      await result.current.editField({ caption: 'x'.repeat(3001) }, ['caption']);
    });

    expect(result.current.saveError).toBe(message);
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
      // Past the widest platform's limit: the wire schema bounds on CAPTION_MAX_ANY_PLATFORM.
      await result.current.editField({ caption: 'x'.repeat(CAPTION_MAX_ANY_PLATFORM + 1) }, [
        'caption',
      ]);
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

    // Every keystroke is visible at once in the editor's draft; the store and the send wait.
    expect(result.current.draft.captionPreview).toBe('abc');
    expect(storedDraft()?.captionPreview).toBe('original caption');
    expect(requestCalls).toHaveLength(0);

    await waitFor(() => expect(requestCalls).toHaveLength(1));
    expect(requestCalls[0]?.body?.caption).toBe('abc');
    await waitFor(() => expect(storedDraft()?.captionPreview).toBe('abc'));
  });

  // Each store write re-renders every calendar cell holding the draft: a burst is one write,
  // carrying the typed text and the server's updated_at together.
  it('writes a burst to the store once, with the server updated_at', async () => {
    requestImpl = async () => ({ updated_at: '2030-08-02T10:00:00.000Z' });
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    act(() => {
      result.current.queueFieldEdit({ caption: 'a' }, ['caption'], { captionPreview: 'a' });
      result.current.queueFieldEdit({ caption: 'ab' }, ['caption'], { captionPreview: 'ab' });
    });
    await act(async () => {
      await result.current.flush();
    });

    expect(storeState.writes).toBe(1);
    expect(storedDraft()?.captionPreview).toBe('ab');
    expect(storedDraft()?.updatedAt).toBe('2030-08-02T10:00:00.000Z');
  });

  it('keeps unsaved typing in the store when the PATCH is rejected', async () => {
    requestImpl = async () => {
      throw new ApiError('boom', 500);
    };
    const target = draft();
    seed(target);
    const { result } = renderHook(() => useDraftFieldEditor(target));

    act(() => {
      result.current.queueFieldEdit({ caption: 'kept' }, ['caption'], { captionPreview: 'kept' });
    });
    await act(async () => {
      await result.current.flush();
    });

    expect(storedDraft()?.captionPreview).toBe('kept');
    expect(show).toHaveBeenCalled();
  });

  // The panel can move to another draft mid-burst; the burst still belongs to the first one.
  it('sends a burst to the draft it was typed into after the panel moves on', async () => {
    const first = draft();
    seed(first);
    const { result, rerender } = renderHook(({ current }) => useDraftFieldEditor(current), {
      initialProps: { current: first },
    });

    act(() => {
      result.current.queueFieldEdit({ caption: 'for one' }, ['caption'], {
        captionPreview: 'for one',
      });
    });
    rerender({ current: draft({ id: 'local-2', backendDraftId: 'srv-2' }) });

    expect(result.current.draft.captionPreview).toBe('original caption');
    await act(async () => {
      await result.current.flush();
    });

    expect(requestCalls[0]?.path).toContain('/srv-1/');
    expect(storedDraft()?.captionPreview).toBe('for one');
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

  it('flush() waits for a discrete edit already on the wire', async () => {
    const target = draft();
    seed(target);
    let release: (value: unknown) => void = () => {};
    requestImpl = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const { result } = renderHook(() => useDraftFieldEditor(target));

    act(() => {
      void result.current.editField({ format: 'Carousel' }, ['format'], { format: 'Carousel' });
    });
    let flushed: boolean | null = null;
    act(() => {
      void result.current.flush().then((saved) => {
        flushed = saved;
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flushed).toBeNull();

    await act(async () => {
      release({ updated_at: 'T1' });
    });
    await waitFor(() => expect(flushed).toBe(true));
  });

  it('a burst flushed behind a save on the wire goes out after it, with the token it returned', async () => {
    const target = draft();
    seed(target);
    let release: (value: unknown) => void = () => {};
    requestImpl = () =>
      requestCalls.length === 1
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve({ updated_at: 'T2' });
    const { result } = renderHook(() => useDraftFieldEditor(target));

    act(() => {
      void result.current.editField({ format: 'Carousel' }, ['format'], { format: 'Carousel' });
      result.current.queueFieldEdit({ caption: 'typed' }, ['caption'], { captionPreview: 'typed' });
    });
    let flushed: boolean | null = null;
    act(() => {
      void result.current.flush().then((saved) => {
        flushed = saved;
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestCalls).toHaveLength(1);

    await act(async () => {
      release({ updated_at: 'T1' });
    });
    await waitFor(() => expect(flushed).toBe(true));
    expect(requestCalls).toHaveLength(2);
    expect(requestCalls[1]?.body).toMatchObject({ caption: 'typed', expected_updated_at: 'T1' });
    expect(show).not.toHaveBeenCalled();
  });

  it('two writers on one row save in turn, each sending the token the last one returned', async () => {
    let release: (value: unknown) => void = () => {};
    requestImpl = () =>
      requestCalls.length === 1
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve({ updated_at: 'T2' });
    const media = renderHook(() => useDraftFieldPersistence()).result.current;
    const fields = renderHook(() => useDraftFieldPersistence()).result.current;
    const row = { id: 'local-1', backendDraftId: 'srv-1', updatedAt: 'T0' };

    const first = media.persistDraftFields(row, { format: 'Carousel' });
    const second = fields.persistDraftFields(row, { caption: 'typed' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.body).toMatchObject({ expected_updated_at: 'T0' });

    release({ updated_at: 'T1' });
    expect(await first).toEqual({ ok: true, updatedAt: 'T1' });
    expect(await second).toEqual({ ok: true, updatedAt: 'T2' });
    expect(requestCalls[1]?.body).toMatchObject({ caption: 'typed', expected_updated_at: 'T1' });
  });

  it('flush() waits for a burst whose coalesce timer already fired', async () => {
    const target = draft();
    seed(target);
    let release: (value: unknown) => void = () => {};
    requestImpl = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const { result } = renderHook(() => useDraftFieldEditor(target));

    act(() => {
      result.current.queueFieldEdit({ caption: 'typed' }, ['caption'], { captionPreview: 'typed' });
    });
    await waitFor(() => expect(requestCalls).toHaveLength(1));
    let flushed: boolean | null = null;
    act(() => {
      void result.current.flush().then((saved) => {
        flushed = saved;
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flushed).toBeNull();
    expect(requestCalls).toHaveLength(1);

    await act(async () => {
      release({ updated_at: 'T1' });
    });
    await waitFor(() => expect(flushed).toBe(true));
  });

  it('flush() reports false when the edit on the wire fails', async () => {
    const target = draft();
    seed(target);
    let fail: (error: unknown) => void = () => {};
    requestImpl = () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      });
    const { result } = renderHook(() => useDraftFieldEditor(target));

    act(() => {
      void result.current.editField({ format: 'Carousel' }, ['format'], { format: 'Carousel' });
    });
    let flushed: boolean | null = null;
    act(() => {
      void result.current.flush().then((saved) => {
        flushed = saved;
      });
    });
    await act(async () => {
      fail(new ApiError('boom', 500));
    });
    await waitFor(() => expect(flushed).toBe(false));
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
