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

  it('without a poster, paints its first frame from metadata only once it nears the screen', () => {
    const realObserver = globalThis.IntersectionObserver;
    let enter: () => void = () => {};
    globalThis.IntersectionObserver = class {
      constructor(report: (entries: { isIntersecting: boolean }[]) => void) {
        enter = () => report([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    try {
      const { container } = render(<VideoStill src={SRC} alt="Clip" />);
      const video = () => container.querySelector('video');
      expect(video()?.getAttribute('src')).toBeNull();
      act(() => enter());
      expect(video()?.getAttribute('src')).toBe(SRC);
      expect(video()?.getAttribute('preload')).toBe('metadata');
      expect(video()?.hasAttribute('autoplay')).toBe(false);
    } finally {
      globalThis.IntersectionObserver = realObserver;
    }
  });

  it('with neither a poster nor a file, draws the placeholder it is given, or a labelled tile', () => {
    const { getByTestId } = render(
      <VideoStill src={null} placeholder={<span data-testid="wireframe" />} />,
    );
    expect(getByTestId('wireframe')).toBeTruthy();
    cleanup();
    const { container, getByLabelText } = render(<VideoStill src={null} alt="Clip" />);
    expect(container.querySelector('video')).toBeNull();
    expect(getByLabelText('Clip').getAttribute('role')).toBe('img');
  });

  it('streams the video only while playing, over its poster', () => {
    const { container } = render(<VideoStill src={SRC} poster={POSTER} playing />);
    const video = container.querySelector('video');
    expect(container.querySelector('img')).toBeNull();
    expect(video?.getAttribute('src')).toBe(SRC);
    expect(video?.getAttribute('poster')).toBe(POSTER);
    expect(video?.getAttribute('preload')).toBe('auto');
  });

  it('names no file on the server: nothing is fetched while the HTML parses', () => {
    const html = renderToString(<VideoStill src={SRC} />);
    expect(html).not.toContain(SRC);
  });
});
