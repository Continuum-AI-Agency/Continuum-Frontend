import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { VideoStill } from './VideoStill';

afterEach(cleanup);

const SRC = 'https://storage.test/clip.mp4';
const POSTER = 'https://storage.test/poster.webp';

describe('VideoStill', () => {
  it('rests as its poster: a lazy still and no video element', () => {
    const { container } = render(<VideoStill src={SRC} poster={POSTER} alt="Clip" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(POSTER);
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(container.querySelector('video')).toBeNull();
  });

  it('without a poster, asks only for metadata, to paint the first frame', () => {
    const { container } = render(<VideoStill src={SRC} eager />);
    const video = container.querySelector('video');
    expect(video?.getAttribute('preload')).toBe('metadata');
    expect(video?.getAttribute('src')).toBe(SRC);
    expect(video?.hasAttribute('autoplay')).toBe(false);
  });

  it('streams the video only while playing, over its poster', () => {
    const { container } = render(<VideoStill src={SRC} poster={POSTER} playing />);
    const video = container.querySelector('video');
    expect(container.querySelector('img')).toBeNull();
    expect(video?.getAttribute('src')).toBe(SRC);
    expect(video?.getAttribute('poster')).toBe(POSTER);
    expect(video?.getAttribute('preload')).toBe('auto');
  });
});

describe('VideoStill on the server', () => {
  it('renders no src for a video at rest: nothing is fetched while the HTML parses', () => {
    // A server has no IntersectionObserver; the test setup installs one, so take it away.
    const observer = globalThis.IntersectionObserver;
    // @ts-expect-error: absent on the server
    delete globalThis.IntersectionObserver;
    try {
      const html = renderToString(<VideoStill src={SRC} />);
      expect(html).toContain('<video');
      expect(html).not.toContain(SRC);
    } finally {
      globalThis.IntersectionObserver = observer;
    }
  });
});

describe('VideoStill near the screen', () => {
  const realObserver = globalThis.IntersectionObserver;
  afterEach(() => {
    globalThis.IntersectionObserver = realObserver;
  });

  it('observes the video that replaces its still, and loads it once it is near', () => {
    const observed: Element[] = [];
    let report: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    globalThis.IntersectionObserver = class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        report = callback;
      }
      observe(node: Element) {
        observed.push(node);
      }
      disconnect() {}
    } as unknown as typeof IntersectionObserver;

    const { container, rerender } = render(<VideoStill src={SRC} poster={POSTER} />);
    expect(container.querySelector('img')).not.toBeNull();

    // The poster goes (a re-signed asset without one): the video that takes its place is watched.
    rerender(<VideoStill src={SRC} poster={null} />);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(observed).toContain(video);
    expect(video.getAttribute('src')).toBeNull();

    act(() => report?.([{ isIntersecting: true }]));
    expect(video.getAttribute('src')).toBe(SRC);
  });
});
