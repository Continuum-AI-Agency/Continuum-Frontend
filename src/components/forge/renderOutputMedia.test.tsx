import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fullSrc, OutputFile, previewSrc, thumbnailSrc } from './renderOutputMedia';

afterEach(cleanup);

// happy-dom never fetches an image, so every image reads as finished with no pixels — a broken
// file to `imageFailed`. Here images decode.
let imagePrototype: object | null = null;
let naturalWidth: PropertyDescriptor | undefined;
beforeAll(() => {
  imagePrototype = Object.getPrototypeOf(document.createElement('img')) as object;
  naturalWidth = Object.getOwnPropertyDescriptor(imagePrototype, 'naturalWidth');
  Object.defineProperty(imagePrototype, 'naturalWidth', { configurable: true, get: () => 1 });
});
afterAll(() => {
  if (imagePrototype && naturalWidth) {
    Object.defineProperty(imagePrototype, 'naturalWidth', naturalWidth);
  }
});

const files = {
  url: 'https://fleet.example/out.mp4',
  libraryUrl: 'https://store.example/out.mp4?download=',
  previewUrl: 'https://store.example/preview_video.mp4',
  thumbnailUrl: 'https://store.example/proxy_480.mp4',
  posterUrl: 'https://store.example/poster.jpg',
};

describe('which file each screen loads', () => {
  test('smallest first, each falling back to the next larger file until it is made', () => {
    expect([thumbnailSrc(files), previewSrc(files), fullSrc(files)]).toEqual([
      files.thumbnailUrl,
      files.previewUrl,
      files.libraryUrl,
    ]);
    const { thumbnailUrl: _thumbnail, ...noThumbnail } = files;
    expect(thumbnailSrc(noThumbnail)).toBe(files.previewUrl);
    expect(thumbnailSrc({ url: files.url, libraryUrl: files.libraryUrl })).toBe(files.libraryUrl);
    // Not in the Library yet: the fleet's file is all there is.
    expect([thumbnailSrc({ url: files.url }), previewSrc({ url: files.url })]).toEqual([
      files.url,
      files.url,
    ]);
  });
});

describe('a render video', () => {
  const mount = () => {
    render(<OutputFile output={{ ...files, kind: 'video' }} alt="Render" />);
    const video = document.querySelector('video');
    if (!video) throw new Error('no video');
    return video;
  };
  const playedOnce = (video: HTMLVideoElement, atSec: number) => {
    Object.defineProperty(video, 'played', { configurable: true, get: () => ({ length: 1 }) });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      writable: true,
      value: atSec,
    });
  };

  test('starts on the 720p, under its poster, and says so', () => {
    const video = mount();
    expect(video.getAttribute('src')).toBe(files.previewUrl);
    expect(video.getAttribute('poster')).toBe(files.posterUrl);
    expect(screen.getByText('720p')).toBeTruthy();
  });

  test('a pause before anyone pressed play changes nothing', () => {
    const video = mount();
    act(() => {
      fireEvent(video, new Event('pause'));
    });
    expect(video.getAttribute('src')).toBe(files.previewUrl);
  });

  test('a pause after a play moves to the original, at the same moment', () => {
    const video = mount();
    playedOnce(video, 7.5);
    act(() => {
      fireEvent(video, new Event('pause'));
    });
    expect(video.getAttribute('src')).toBe(files.libraryUrl);
    expect(screen.queryByText('720p')).toBeNull();
    video.currentTime = 0;
    act(() => {
      fireEvent(video, new Event('loadedmetadata'));
    });
    expect(video.currentTime).toBe(7.5);
  });

  test('a 720p that will not load falls back to the original, not to "broken"', () => {
    const video = mount();
    act(() => {
      fireEvent(video, new Event('error'));
    });
    expect(video.getAttribute('src')).toBe(files.libraryUrl);
    expect(screen.queryByText(/can’t play/)).toBeNull();
  });
});

describe('a render image', () => {
  test('paints its 480p behind the original until the original has loaded', () => {
    render(
      <OutputFile
        output={{
          kind: 'image',
          url: 'https://fleet.example/out.png',
          libraryUrl: 'https://store.example/out.png',
          thumbnailUrl: 'https://store.example/thumbnail.webp',
        }}
        alt="Render"
      />,
    );
    const image = screen.getByAltText('Render') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('https://store.example/out.png');
    expect(image.style.backgroundImage).toContain('thumbnail.webp');
    act(() => {
      fireEvent.load(image);
    });
    expect(image.style.backgroundImage).toBe('');
  });
});
