import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
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
