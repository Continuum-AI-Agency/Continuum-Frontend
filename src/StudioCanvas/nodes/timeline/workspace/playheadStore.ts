import { useSyncExternalStore } from 'react';

export type PlaybackControls = {
  seek: (sec: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
};

/**
 * The playhead moves every animation frame. Held in workspace state it re-rendered every
 * lane, the inspector, the bin and the palette sixty times a second; here only what draws
 * it live (stage, playhead line, clock) follows each frame. Everything else reads it at
 * the moment it acts, or follows the settled value (paused, or after a seek).
 */
export function createPlayheadStore() {
  let sec = 0;
  let settled = 0;
  let controls: PlaybackControls | null = null;
  const live = new Set<() => void>();
  const calm = new Set<() => void>();
  const subscriber = (listeners: Set<() => void>) => (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    getSec: () => sec,
    getSettled: () => settled,
    subscribeLive: subscriber(live),
    subscribeSettled: subscriber(calm),
    /** The stage reports the driver's state after every render. */
    publish(next: number, playing: boolean) {
      if (next !== sec) {
        sec = next;
        for (const listener of live) listener();
      }
      if (!playing && settled !== sec) {
        settled = sec;
        for (const listener of calm) listener();
      }
    },
    connect(next: PlaybackControls) {
      controls = next;
    },
    seek: (next: number) => controls?.seek(next),
    toggle: () => controls?.toggle(),
    play: () => controls?.play(),
    pause: () => controls?.pause(),
  };
}

export type PlayheadStore = ReturnType<typeof createPlayheadStore>;

export const useLivePlayhead = (store: PlayheadStore): number =>
  useSyncExternalStore(store.subscribeLive, store.getSec, store.getSec);

export const useSettledPlayhead = (store: PlayheadStore): number =>
  useSyncExternalStore(store.subscribeSettled, store.getSettled, store.getSettled);
