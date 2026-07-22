import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { DragEndEvent } from '@dnd-kit/core';
import { act, renderHook } from '@testing-library/react';

import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import type { OrganicCalendarDay, OrganicCalendarDraft } from '../primitives/types';

const updateDraft = mock(() => {});
const addDraft = mock(() => {});
const reschedule = mock(() => Promise.resolve());
const rescheduleMany = mock(() => Promise.resolve());

const storeStub = createCalendarStoreStub({ updateDraft, addDraft });
mock.module('@/lib/organic/store', () => storeStub);
mock.module('zustand/react/shallow', () => ({ useShallow: (fn: (s: unknown) => unknown) => fn }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show: mock() }) }));

const { useCalendarDnD } = await import('./useCalendarDnD');

const DAYS: OrganicCalendarDay[] = [
  { id: '2026-08-03', label: 'Mon', dateLabel: 'Aug 3', suggestedTimes: [], slots: [] },
];
const DRAFTS: OrganicCalendarDraft[] = [];

function dragOntoCell(selectedIds: string[]): void {
  const { result } = renderHook(() =>
    useCalendarDnD(DAYS, DRAFTS, { instagram: 'acct-ig' }, selectedIds, {
      reschedule,
      rescheduleMany,
    }),
  );
  const event = {
    active: { id: 'd1', data: { current: { type: 'draft' } } },
    over: { id: 'planner-cell::2026-08-10::instagram' },
  } as unknown as DragEndEvent;
  act(() => {
    result.current.handleDragEnd(event);
  });
}

describe('useCalendarDnD — multi-select drag', () => {
  beforeEach(() => {
    updateDraft.mockClear();
    addDraft.mockClear();
    reschedule.mockClear();
    rescheduleMany.mockClear();
  });

  afterEach(() => {
    storeStub.useCalendarStore.mockImplementation(storeStub.useCalendarStore.defaultImplementation);
  });

  it('moves the whole selection when the dragged draft is part of a multi-selection', () => {
    dragOntoCell(['d1', 'd2', 'd3']);

    expect(rescheduleMany).toHaveBeenCalledTimes(1);
    expect(rescheduleMany).toHaveBeenCalledWith(['d1', 'd2', 'd3'], '2026-08-10');
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('moves only the dragged draft for a single selection', () => {
    dragOntoCell(['d1']);

    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(reschedule).toHaveBeenCalledWith('d1', '2026-08-10');
    expect(rescheduleMany).not.toHaveBeenCalled();
  });

  it('moves only the dragged draft when nothing is selected', () => {
    dragOntoCell([]);

    expect(reschedule).toHaveBeenCalledWith('d1', '2026-08-10');
    expect(rescheduleMany).not.toHaveBeenCalled();
  });

  it('restamps the destination platform onto the dragged draft', () => {
    dragOntoCell(['d1']);

    expect(updateDraft).toHaveBeenCalledTimes(1);
    const updater = updateDraft.mock.calls[0]?.[1] as (
      d: OrganicCalendarDraft,
    ) => OrganicCalendarDraft;
    const next = updater({
      platforms: ['linkedin'],
      targetAccountId: 'old',
    } as OrganicCalendarDraft);
    expect(next.platforms).toEqual(['instagram']);
    expect(next.targetAccountId).toBe('acct-ig');
  });
});
