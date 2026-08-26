// A room id only means something paired with the brand it was picked for. An in-app brand
// switch is a soft refresh, so StudioCanvas stays mounted and its room state outlives the
// brand that chose it — and every consumer below reads the pair as real, up to and including
// the canvas_active_view heartbeat that writes it to the database. This spec records the
// arguments those consumers are actually called with, before and after a mounted switch.
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, render } from '@testing-library/react';

type ConsumerCall = { brandProfileId?: string; roomId?: string };
type TestRoom = { id: string; brand_profile_id: string };

const ROOM_BRAND: Record<string, string> = { 'room-a1': 'brand-a', 'room-b1': 'brand-b' };
const ROOMS_A: TestRoom[] = [{ id: 'room-a1', brand_profile_id: 'brand-a' }];
const ROOMS_B: TestRoom[] = [{ id: 'room-b1', brand_profile_id: 'brand-b' }];

const realtimeCalls: ConsumerCall[] = [];
const runRequestCalls: ConsumerCall[] = [];
const continuationCalls: ConsumerCall[] = [];
const replacedHrefs: string[] = [];
let rooms: TestRoom[] = ROOMS_A;

// bun's mock.module is process-global and the whole suite runs in one process, so a plain
// override follows the run into every later spec importing the same module — and
// useCanvasRealtime, useCanvasRooms and the toast provider all have their own. mock.restore()
// does not undo a module mock, so each override below delegates to the real implementation
// unless this file's specs are the ones running. The copies must be plain objects taken
// BEFORE the mock: bun re-points an imported namespace at the mock, so delegating through
// the namespace itself would call the mock again and never return.
const actualRealtime = { ...(await import('@/components/ai-studio/hooks/useCanvasRealtime')) };
const actualRooms = { ...(await import('@/components/ai-studio/hooks/useCanvasRooms')) };
const actualRunRequests = { ...(await import('@/components/ai-studio/hooks/useCanvasRunRequests')) };
const actualContinuations = { ...(await import('../hooks/useTimelineRenderContinuations')) };
const actualNavigation = { ...(await import('next/navigation')) };
const actualToast = { ...(await import('@/components/ui/ToastProvider')) };
let fenceSpecsRunning = false;

mock.module('@/components/ai-studio/hooks/useCanvasRealtime', () => ({
  ...actualRealtime,
  useCanvasRealtime: (brandProfileId: string, roomId?: string) => {
    if (!fenceSpecsRunning) return actualRealtime.useCanvasRealtime(brandProfileId, roomId);
    realtimeCalls.push({ brandProfileId, roomId });
    // isLoading keeps Flow on its loader branch: the subject here is the arguments the
    // hooks receive, not the canvas they would draw.
    return {
      remoteCursors: {},
      updateCursor: () => {},
      isLoading: true,
      isSaving: false,
      isCollaborative: false,
      onlineUsers: [],
      status: 'SUBSCRIBED',
      dbStatus: 'SUBSCRIBED',
      saveCanvasToDatabase: async () => {},
    } as unknown as ReturnType<typeof actualRealtime.useCanvasRealtime>;
  },
}));

mock.module('@/components/ai-studio/hooks/useCanvasRooms', () => ({
  ...actualRooms,
  useCanvasRooms: (brandProfileId: string) => {
    if (!fenceSpecsRunning) return actualRooms.useCanvasRooms(brandProfileId);
    return {
      rooms,
      isLoading: false,
      createRoom: async () => null,
      renameRoom: async () => false,
      deleteRoom: async () => false,
    } as unknown as ReturnType<typeof actualRooms.useCanvasRooms>;
  },
}));

mock.module('@/components/ai-studio/hooks/useCanvasRunRequests', () => ({
  ...actualRunRequests,
  useCanvasRunRequests: (brandProfileId: string, roomId?: string) => {
    if (!fenceSpecsRunning) return actualRunRequests.useCanvasRunRequests(brandProfileId, roomId);
    runRequestCalls.push({ brandProfileId, roomId });
  },
}));

mock.module('../hooks/useTimelineRenderContinuations', () => ({
  ...actualContinuations,
  useTimelineRenderContinuations: (brandProfileId?: string, roomId?: string) => {
    if (!fenceSpecsRunning) {
      return actualContinuations.useTimelineRenderContinuations(brandProfileId, roomId);
    }
    continuationCalls.push({ brandProfileId, roomId });
  },
}));

// The preload's global next/navigation mock hands out a no-op replace, which cannot be
// asserted on — this one records the hrefs the room selection writes.
mock.module('next/navigation', () => ({
  ...actualNavigation,
  useRouter: () =>
    fenceSpecsRunning
      ? {
          replace: (href: string) => {
            replacedHrefs.push(href);
          },
          push: () => {},
          prefetch: () => {},
          back: () => {},
          forward: () => {},
          refresh: () => {},
        }
      : actualNavigation.useRouter(),
}));

// useToast throws outside its provider, and both StudioCanvas and Flow call it.
mock.module('@/components/ui/ToastProvider', () => ({
  ...actualToast,
  useToast: () =>
    fenceSpecsRunning
      ? ({ show: () => {}, dismiss: () => {} } as unknown as ReturnType<typeof actualToast.useToast>)
      : actualToast.useToast(),
}));

const { StudioCanvas } = await import('./StudioCanvas');
const { useStudioStore } = await import('../stores/useStudioStore');

// A call is cross-brand when it names a room this brand does not own. A room-less call is
// fine: that is the fence holding while the new brand's rooms are still loading.
const crossBrandCalls = (calls: ConsumerCall[]): ConsumerCall[] =>
  calls.filter(
    (call) => call.roomId !== undefined && ROOM_BRAND[call.roomId] !== call.brandProfileId,
  );

beforeEach(() => {
  fenceSpecsRunning = true;
  rooms = ROOMS_A;
  realtimeCalls.length = 0;
  runRequestCalls.length = 0;
  continuationCalls.length = 0;
  replacedHrefs.length = 0;
});

afterEach(() => {
  cleanup();
});

// Hands every mocked module back to its real implementation for the rest of the run.
afterAll(() => {
  fenceSpecsRunning = false;
});

describe('StudioCanvas brand/room fence', () => {
  it('connects the server-resolved room on first paint', () => {
    render(<StudioCanvas embedded brandProfileId="brand-a" initialRoomId="room-a1" />);

    expect(realtimeCalls[0]).toEqual({ brandProfileId: 'brand-a', roomId: 'room-a1' });
  });

  it('never pairs the new brand with the previous brand’s room across a mounted switch', async () => {
    const view = render(<StudioCanvas embedded brandProfileId="brand-a" initialRoomId="room-a1" />);

    // The real refetch window: useCanvasRooms still reports the previous brand's rooms when
    // the new brandProfileId arrives.
    await act(async () => {
      view.rerender(<StudioCanvas embedded brandProfileId="brand-b" initialRoomId="room-b1" />);
    });

    expect(crossBrandCalls(realtimeCalls)).toEqual([]);
    expect(crossBrandCalls(runRequestCalls)).toEqual([]);
    expect(crossBrandCalls(continuationCalls)).toEqual([]);
    expect(useStudioStore.getState().activeRoomId).toBeUndefined();
  });

  it('selects the new brand’s first room once its rooms arrive, and puts it in the URL', async () => {
    const view = render(<StudioCanvas embedded brandProfileId="brand-a" initialRoomId="room-a1" />);

    await act(async () => {
      view.rerender(<StudioCanvas embedded brandProfileId="brand-b" initialRoomId="room-b1" />);
    });

    rooms = ROOMS_B;
    await act(async () => {
      view.rerender(<StudioCanvas embedded brandProfileId="brand-b" initialRoomId="room-b1" />);
    });

    expect(realtimeCalls.at(-1)).toEqual({ brandProfileId: 'brand-b', roomId: 'room-b1' });
    expect(crossBrandCalls(realtimeCalls)).toEqual([]);
    expect(replacedHrefs.at(-1)).toBe('?roomId=room-b1');
  });
});
