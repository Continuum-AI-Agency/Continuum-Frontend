// A one-value pub/sub for the video stage's playhead.
//
// The player fires timeupdate ~4x/second. Lifting that into the modal's React
// state would re-render the comment sidebar, the version rail, and every header
// slot on every tick. Instead the player publishes into this clock and only the
// components that care (the transcript panel) subscribe — and they coalesce their
// own re-renders. Nothing above them re-renders at all.

export type PlaybackClock = {
  publish: (timeMs: number) => void;
  subscribe: (listener: (timeMs: number) => void) => () => void;
  get: () => number;
};

export function createPlaybackClock(): PlaybackClock {
  const listeners = new Set<(timeMs: number) => void>();
  let current = 0;

  return {
    publish(timeMs) {
      current = timeMs;
      for (const listener of listeners) listener(timeMs);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get() {
      return current;
    },
  };
}
