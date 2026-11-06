import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
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

  it('without a poster, rests as a neutral tile: no video, no metadata read', () => {
    const { container, getByLabelText } = render(<VideoStill src={SRC} alt="Clip" />);
    expect(container.querySelector('video')).toBeNull();
    expect(getByLabelText('Clip').getAttribute('role')).toBe('img');
  });

  it('draws the placeholder it is given', () => {
    const { getByTestId } = render(
      <VideoStill src={SRC} placeholder={<span data-testid="wireframe" />} />,
    );
    expect(getByTestId('wireframe')).toBeTruthy();
  });

  it('streams the video only while playing, over its poster', () => {
    const { container } = render(<VideoStill src={SRC} poster={POSTER} playing />);
    const video = container.querySelector('video');
    expect(container.querySelector('img')).toBeNull();
    expect(video?.getAttribute('src')).toBe(SRC);
    expect(video?.getAttribute('poster')).toBe(POSTER);
    expect(video?.getAttribute('preload')).toBe('auto');
  });

  it('renders no video on the server: nothing is fetched while the HTML parses', () => {
    const html = renderToString(<VideoStill src={SRC} />);
    expect(html).not.toContain(SRC);
    expect(html).not.toContain('<video');
  });
});
