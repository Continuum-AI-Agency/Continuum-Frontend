import { afterEach, describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { AssetStill, assetStill } from './AssetStill';

afterEach(cleanup);

const asset = (over: Partial<MediaAsset>) =>
  ({
    kind: 'image',
    signedUrl: 'https://s.test/original.png',
    thumbnailUrl: null,
    preview: null,
    ...over,
  }) as unknown as MediaAsset;

describe('assetStill', () => {
  it('is the 480 px still or poster before anything else', () => {
    expect(assetStill(asset({ thumbnailUrl: 'https://s.test/480.webp' }))).toBe(
      'https://s.test/480.webp',
    );
  });

  it('is the Library preview still for a file an <img> cannot draw', () => {
    const psd = asset({
      kind: 'file',
      preview: { state: 'ready', kind: 'image', signedUrl: 'https://s.test/preview.webp' },
    } as Partial<MediaAsset>);
    expect(assetStill(psd)).toBe('https://s.test/preview.webp');
  });

  it("is an image's own file only when it has nothing smaller, and never a video's file", () => {
    expect(assetStill(asset({}))).toBe('https://s.test/original.png');
    expect(assetStill(asset({ kind: 'video', signedUrl: 'https://s.test/clip.mp4' }))).toBeNull();
  });
});

describe('AssetStill', () => {
  it('draws a postered video as its poster, lazily, with no video bytes', () => {
    const { container } = render(
      <AssetStill
        asset={asset({
          kind: 'video',
          signedUrl: 'https://s.test/clip.mp4',
          thumbnailUrl: 'https://s.test/poster.webp',
        })}
        alt="Clip"
      />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://s.test/poster.webp');
    expect(container.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    expect(container.querySelector('video')).toBeNull();
  });
});
