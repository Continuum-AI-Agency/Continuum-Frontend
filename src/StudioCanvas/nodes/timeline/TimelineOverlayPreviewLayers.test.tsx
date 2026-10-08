import { expect, it, spyOn } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import type { OverlayPreviewLayer } from './overlayPreview';
import { TimelineOverlayPreviewLayers } from './TimelineOverlayPreviewLayers';

it('reapplies an overlay seek dropped before metadata and removes the retry on unmount', () => {
  const original = Object.getOwnPropertyDescriptor(
    window.HTMLMediaElement.prototype,
    'currentTime',
  );
  const originalReady = Object.getOwnPropertyDescriptor(
    window.HTMLMediaElement.prototype,
    'readyState',
  );
  const positions = new WeakMap<HTMLMediaElement, number>();
  const ready = new WeakSet<HTMLMediaElement>();
  Object.defineProperty(window.HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return positions.get(this) ?? 0;
    },
    set(this: HTMLMediaElement, sec: number) {
      if (ready.has(this)) positions.set(this, sec);
    },
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return ready.has(this) ? 1 : 0;
    },
  });
  const pause = spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => undefined,
  );
  const layer: OverlayPreviewLayer = {
    id: 'recorded-overlay',
    kind: 'video',
    url: 'blob:recorded',
    sourceSec: 248.5,
    playbackRate: 1.5,
    volume: 0,
    muted: true,
    effectTimeSec: 0.5,
    mediaStyle: {},
    textOverlays: [],
  };
  let unmount: (() => void) | undefined;
  try {
    const view = render(<TimelineOverlayPreviewLayers layers={[layer]} isPlaying={false} />);
    unmount = view.unmount;
    const video = view.container.querySelector('video');
    if (!video) throw new Error('overlay video missing');
    expect(video.currentTime).toBe(0);
    ready.add(video);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(248.5);
    expect(video.playbackRate).toBe(1.5);
    expect(video.muted).toBe(true);
    view.rerender(
      <TimelineOverlayPreviewLayers layers={[{ ...layer, sourceSec: 250 }]} isPlaying={false} />,
    );
    expect(video.currentTime).toBe(250);
    view.unmount();
    positions.set(video, 0);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(0);
  } finally {
    unmount?.();
    pause.mockRestore();
    if (originalReady)
      Object.defineProperty(window.HTMLMediaElement.prototype, 'readyState', originalReady);
    if (original) Object.defineProperty(window.HTMLMediaElement.prototype, 'currentTime', original);
  }
});
