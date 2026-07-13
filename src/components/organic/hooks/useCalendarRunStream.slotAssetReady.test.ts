import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { renderHook } from '@testing-library/react';

import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import { useCalendarRunStream } from './useCalendarRunStream';

const upsertGeneration = mock();
const setGridStatus = mock();
const setGridProgress = mock();
const setGridError = mock();
const setGridJobId = mock();
const addDraft = mock();
const updateDraft = mock();

let capturedHandleEvent: ((event: { type: string; data: Record<string, unknown> }) => void) | null =
  null;

// mock.module is process-wide: the shared stub answers keys this file does not name with
// a no-op, so sibling specs' hooks don't receive `undefined` for their store selectors.
mock.module('@/lib/organic/store', () =>
  createCalendarStoreStub({
    setGridStatus,
    setGridProgress,
    setGridError,
    setGridJobId,
    addDraft,
    updateDraft,
    upsertGeneration,
  }),
);

mock.module('@/hooks/useRunEventStream', () => ({
  useRunEventStream: (
    _runId: unknown,
    handler: (event: { type: string; data: Record<string, unknown> }) => void,
  ) => {
    capturedHandleEvent = handler;
    return { status: 'idle' };
  },
}));

mock.module('zustand/react/shallow', () => ({
  useShallow: (fn: (s: unknown) => unknown) => fn,
}));

describe('useCalendarRunStream — slot_asset_ready', () => {
  beforeEach(() => {
    upsertGeneration.mockClear();
    capturedHandleEvent = null;
  });

  it('calls upsertGeneration with previewUrl from images[0]', () => {
    renderHook(() => useCalendarRunStream());
    expect(capturedHandleEvent).not.toBeNull();

    capturedHandleEvent!({
      type: 'slot_asset_ready',
      data: {
        placement_id: 'placement-abc',
        images: ['https://cdn.example.com/preview.jpg'],
      },
    });

    expect(upsertGeneration).toHaveBeenCalledWith({
      jobId: 'placement-abc',
      previewUrl: 'https://cdn.example.com/preview.jpg',
    });
  });

  it('falls back to image_url when no images array', () => {
    renderHook(() => useCalendarRunStream());

    capturedHandleEvent!({
      type: 'slot_asset_ready',
      data: {
        placement_id: 'placement-xyz',
        image_url: 'https://cdn.example.com/single.jpg',
      },
    });

    expect(upsertGeneration).toHaveBeenCalledWith({
      jobId: 'placement-xyz',
      previewUrl: 'https://cdn.example.com/single.jpg',
    });
  });

  it('accepts camelCase placementId', () => {
    renderHook(() => useCalendarRunStream());

    capturedHandleEvent!({
      type: 'slot_asset_ready',
      data: {
        placementId: 'placement-camel',
        imageUrl: 'https://cdn.example.com/camel.jpg',
      },
    });

    expect(upsertGeneration).toHaveBeenCalledWith({
      jobId: 'placement-camel',
      previewUrl: 'https://cdn.example.com/camel.jpg',
    });
  });

  it('does not call upsertGeneration without a placementId', () => {
    renderHook(() => useCalendarRunStream());

    capturedHandleEvent!({
      type: 'slot_asset_ready',
      data: { image_url: 'https://cdn.example.com/orphan.jpg' },
    });

    expect(upsertGeneration).not.toHaveBeenCalled();
  });
});
