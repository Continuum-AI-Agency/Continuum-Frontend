// The media stack below the mosaic is deliberately NOT mocked. Stubbing ChatMedia here
// would hide the one composition risk that matters — the tile sits inside a Radix
// HoverCard trigger, and if that trigger swallowed pointerenter, hover-to-play would
// never fire. So the real CreativeHoverCard, ChatMediaCarousel and ChatMediaThumb all
// render, and the hover tests drive a pointer at the actual <video>.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AdDailyTrend, AdsetAd, PaidAdAngle } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as realData from '../useOptimizerData';

// embla and Radix reach for observers happy-dom does not expose. Inert stubs are
// fine: these tests assert wiring and the src/preload contract, not layout.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const testGlobals = globalThis as unknown as Record<string, unknown>;
const testWindow = global.window as unknown as Record<string, unknown>;
testGlobals.ResizeObserver ??= ObserverStub;
testGlobals.IntersectionObserver ??= ObserverStub;
testGlobals.MutationObserver ??= testWindow.MutationObserver ?? ObserverStub;
const elementProto = HTMLElement.prototype as unknown as Record<string, unknown>;
elementProto.hasPointerCapture ??= () => false;
elementProto.setPointerCapture ??= () => {};
elementProto.releasePointerCapture ??= () => {};

// Mutable hook returns so each test drives the load state without re-mocking the
// process-wide module.
let adsReturn: { data: AdsetAd[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
let trendsReturn: { data: AdDailyTrend[] } = { data: [] };
let anglesReturn: { data: PaidAdAngle[] } = { data: [] };

mock.module('../useOptimizerData', () => ({
  ...realData,
  useOptimizerAdsetAds: () => adsReturn,
  useOptimizerAdDailyTrends: () => trendsReturn,
  useOptimizerAdAngles: () => anglesReturn,
}));

mock.module('@/hooks/usePaidCreativeRecovery', () => ({
  usePaidCreativeRecovery: () => ({ freshUrlById: {}, recover: () => {} }),
}));

// The one stub kept: a Radix Dialog rendering through a portal tells us nothing extra
// about the mosaic, and this keeps "which slide opened" easy to assert.
mock.module('@/components/organic/primitives/MediaLightbox', () => ({
  MediaLightbox: ({ items, title }: { items: unknown[]; title: string }) => (
    <div data-items={items.length} data-testid="lightbox">
      {title}
    </div>
  ),
}));

const { AdsetCreativeMosaic } = await import('./AdsetCreativeMosaic');

function ad(id: string, name: string, creative?: AdsetAd['creative']): AdsetAd {
  return { id, name, status: 'ACTIVE', thumbnailUrl: `https://cdn.test/${id}.jpg`, creative };
}

/** Shaped like what the deployed edge returns for a Vivo47 reel: an Instagram-hosted
 *  MP4 alongside a Facebook-hosted poster. */
function videoAd(): AdsetAd {
  return ad('ad-reel', 'Vivo47 Video Ene26', {
    format: 'video',
    posterUrl: 'https://cdn.test/poster.jpg',
    videoUrl: 'https://cdn.test/clip.mp4',
  });
}

function trend(adId: string, spend: number, impressions: number): AdDailyTrend {
  return {
    ad_id: adId,
    ad_name: adId,
    series: [
      {
        date: '2026-07-20',
        spend,
        impressions,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        cpa: null,
        roas: null,
        purchases: 0,
        purchase_value: 0,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  adsReturn = { data: [], isLoading: false, isError: false };
  trendsReturn = { data: [] };
  anglesReturn = { data: [] };
});

describe('AdsetCreativeMosaic', () => {
  it('prompts to select an ad set when none is focused', () => {
    render(<AdsetCreativeMosaic accountId="act_1" adsetId={null} brandId="b1" currency="USD" />);
    expect(document.body.textContent).toContain('Select an ad set');
  });

  it('shows skeleton tiles while the ads load', () => {
    adsReturn = { data: [], isLoading: true, isError: false };
    const { container } = render(
      <AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />,
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(6);
  });

  it('surfaces a load error', () => {
    adsReturn = { data: [], isLoading: false, isError: true };
    render(<AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />);
    expect(document.body.textContent).toContain('Couldn’t load the ads');
  });

  it('says so when the ad set has no ads', () => {
    adsReturn = { data: [], isLoading: false, isError: false };
    render(<AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />);
    expect(document.body.textContent).toContain('No ads in this ad set');
  });

  it('renders one tile per ad with a spend·CPM line derived from the daily trend', () => {
    adsReturn = {
      data: [ad('ad-1', 'Hook A'), ad('ad-2', 'Hook B')],
      isLoading: false,
      isError: false,
    };
    // ad-1: $250 over 25,000 impressions → CPM = 250/25000*1000 = $10.
    trendsReturn = { data: [trend('ad-1', 250, 25000)] };
    anglesReturn = {
      data: [
        {
          ad_id: 'ad-1',
          adset_id: 'as-1',
          angle: 'scarcity',
          themes: [],
          analyzed_from_image: false,
        } as PaidAdAngle,
      ],
    };

    const { container } = render(
      <AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />,
    );

    expect(screen.getByText('Hook A')).toBeTruthy();
    expect(screen.getByText('Hook B')).toBeTruthy();
    expect(container.querySelectorAll('img').length).toBe(2);
    // The derived CPM for ad-1, and its angle chip.
    expect(document.body.textContent).toContain('$250 · CPM $10');
    expect(document.body.textContent).toContain('Scarcity');
  });

  it('renders the readable image, not Metas 64x64 thumbnail', () => {
    adsReturn = {
      data: [ad('ad-1', 'Hook A', { format: 'image', imageUrl: 'https://cdn.test/full.jpg' })],
      isLoading: false,
      isError: false,
    };
    const { container } = render(
      <AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toContain('full.jpg');
    expect(container.querySelector('img')?.getAttribute('src')).not.toContain('ad-1.jpg');
  });

  it('pages a carousel in place, one slide per child', () => {
    adsReturn = {
      data: [
        ad('ad-1', 'Carousel', {
          format: 'carousel',
          slides: [
            { index: 0, imageUrl: 'https://cdn.test/1.jpg' },
            { index: 1, imageUrl: 'https://cdn.test/2.jpg' },
            { index: 2, imageUrl: 'https://cdn.test/3.jpg' },
          ],
        }),
      ],
      isLoading: false,
      isError: false,
    };
    const { container } = render(
      <AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />,
    );
    expect(container.querySelectorAll('img').length).toBe(3);
    expect(document.body.textContent).toContain('1/3');
    expect(screen.getByRole('button', { name: /next/i })).toBeTruthy();
  });

  it('renders a real <video> on its poster and downloads nothing before hover', () => {
    adsReturn = { data: [videoAd()], isLoading: false, isError: false };
    const { container } = render(
      <AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />,
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.getAttribute('poster')).toBe('https://cdn.test/poster.jpg');
    expect(video.getAttribute('preload')).toBe('none');
    expect(video.getAttribute('src')).toBeNull();
  });

  it('starts playback on pointer enter — the HoverCard trigger does not swallow it', () => {
    adsReturn = { data: [videoAd()], isLoading: false, isError: false };
    const { container } = render(
      <AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />,
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    const play = mock(() => Promise.resolve());
    const pause = mock();
    video.play = play as unknown as HTMLVideoElement['play'];
    video.pause = pause as unknown as HTMLVideoElement['pause'];

    fireEvent.pointerEnter(video);
    expect(video.getAttribute('src')).toBe('https://cdn.test/clip.mp4');
    fireEvent.loadedData(video);
    expect(play).toHaveBeenCalled();

    fireEvent.pointerLeave(video);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('keeps a source-less video as a still, badged Video, with no <video> to play', () => {
    adsReturn = {
      data: [ad('ad-1', 'Reel', { format: 'video', posterUrl: 'https://cdn.test/poster.jpg' })],
      isLoading: false,
      isError: false,
    };
    const { container } = render(
      <AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />,
    );
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toContain('poster.jpg');
    expect(document.body.textContent).toContain('Video');
  });

  it('opens the full-size viewer on the slide that was activated', () => {
    adsReturn = {
      data: [
        ad('ad-1', 'Carousel', {
          format: 'carousel',
          slides: [
            { index: 0, imageUrl: 'https://cdn.test/1.jpg' },
            { index: 1, imageUrl: 'https://cdn.test/2.jpg' },
          ],
        }),
      ],
      isLoading: false,
      isError: false,
    };
    render(<AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />);
    expect(screen.queryByTestId('lightbox')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /^Open /i })[0] as HTMLElement);
    const lightbox = screen.getByTestId('lightbox');
    expect(lightbox.getAttribute('data-items')).toBe('2');
    expect(lightbox.textContent).toBe('Carousel');
  });

  it('still shows the AD tile when an ad has no usable media at all', () => {
    adsReturn = {
      data: [{ id: 'ad-1', name: 'Broken', status: 'ACTIVE', thumbnailUrl: null }],
      isLoading: false,
      isError: false,
    };
    const { container } = render(
      <AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(document.body.textContent).toContain('AD');
  });
});
