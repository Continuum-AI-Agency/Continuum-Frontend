'use client';

// TEMPORARY visual-QA harness for PostQuickLook spacing/text rendering.
// Not linked from any nav; safe to delete after review.

import { PostQuickLook } from '@/components/organic/cards/PostQuickLook';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';

function days(count: number, offset: number, valueFor: (day: number) => Record<string, number>) {
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1 + offset;
    return {
      date: `2026-06-${String(day).padStart(2, '0')}`,
      ...valueFor(day),
    };
  });
}

const imageFullHistory: OrganicPost = {
  id: 'img-full',
  mediaType: 'IMAGE',
  timestamp: '2026-06-16T20:34:00Z',
  permalink: 'https://instagram.com/p/example',
  caption:
    'El Prompt Engineering ha muerto. Deja de perder el tiempo memorizando plantillas de copiar y pegar. Pasar horas redactando prompts interminables es la forma antigua de...',
  metrics: {
    reach: 426,
    views: 705,
    totalInteractions: 10,
    likes: 6,
    comments: 2,
    shares: 0,
    saved: 2,
  },
  breakdown7d: days(7, 7, (d) => ({
    views: 90 + d,
    reach: 55 + d,
    engagement: 1,
    comments: 0,
    likes: 0,
    shares: 0,
    saved: 0,
  })),
  comparison: {
    views: { current: 705, previous: 640, percentageChange: 10.2 },
    engagement: { current: 10, previous: 10, percentageChange: 0 },
    comments: { current: 2, previous: 3, percentageChange: -33.3 },
    likes: { current: 6, previous: 4, percentageChange: 50 },
    shares: { current: 0, previous: 2, percentageChange: -100 },
    saved: { current: 2, previous: 0, percentageChange: 100 },
  },
} as unknown as OrganicPost;

const imageBuildingHistory: OrganicPost = {
  id: 'img-building',
  mediaType: 'IMAGE',
  timestamp: '2026-06-27T09:00:00Z',
  caption: 'New product teaser, still accruing history.',
  metrics: {
    reach: 812,
    views: 1204,
    totalInteractions: 40,
    likes: 30,
    comments: 6,
    shares: 1,
    saved: 3,
  },
  breakdown7d: days(5, 0, (d) => ({
    views: 200 + d * 10,
    reach: 150 + d * 5,
    engagement: 8,
    comments: 1,
    likes: 6,
    shares: 0,
    saved: 1,
  })),
  comparison: null,
} as unknown as OrganicPost;

const imageBrandNew: OrganicPost = {
  id: 'img-brand-new',
  mediaType: 'IMAGE',
  timestamp: '2026-07-01T08:00:00Z',
  caption: 'Just published, no history yet.',
  metrics: {
    reach: 50,
    views: 80,
    totalInteractions: 2,
    likes: 2,
    comments: 0,
    shares: 0,
    saved: 0,
  },
} as unknown as OrganicPost;

const reelFullHistory: OrganicPost = {
  id: 'reel-full',
  mediaType: 'VIDEO',
  mediaProductType: 'REELS',
  timestamp: '2026-06-20T18:00:00Z',
  caption: 'Hook rate check for reels layout.',
  metrics: {
    views: 15230,
    reach: 9800,
    hookRate: 68.4,
    reelsAvgWatchTime: 4200,
    reelsVideoViewTotalTime: 6400000,
    totalInteractions: 900,
    likes: 700,
    comments: 120,
    shares: 40,
    saved: 40,
  },
  breakdown7d: days(7, 7, (d) => ({
    views: 2000 + d * 50,
    reach: 1200 + d * 20,
    engagement: 100,
    comments: 10,
    likes: 80,
    shares: 4,
    saved: 4,
  })),
  comparison: {
    views: { current: 15230, previous: 12100, percentageChange: 25.9 },
    engagement: { current: 900, previous: 950, percentageChange: -5.3 },
    comments: { current: 120, previous: 90, percentageChange: 33.3 },
    likes: { current: 700, previous: 700, percentageChange: 0 },
    shares: { current: 40, previous: 10, percentageChange: 300 },
    saved: { current: 40, previous: 20, percentageChange: 100 },
  },
} as unknown as OrganicPost;

const carouselFullHistory: OrganicPost = {
  id: 'carousel-full',
  mediaType: 'CAROUSEL_ALBUM',
  timestamp: '2026-06-18T12:00:00Z',
  caption: 'Carousel layout check with saves as primary.',
  carouselMedia: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
  metrics: {
    reach: 3400,
    views: 4100,
    saved: 210,
    totalInteractions: 300,
    likes: 250,
    comments: 30,
    shares: 20,
  },
  breakdown7d: days(7, 7, (d) => ({
    views: 500 + d * 5,
    reach: 400 + d * 3,
    engagement: 30,
    comments: 3,
    likes: 25,
    shares: 2,
    saved: 20,
  })),
  comparison: {
    views: { current: 4100, previous: 4050, percentageChange: 1.2 },
    engagement: { current: 300, previous: 280, percentageChange: 7.1 },
    comments: { current: 30, previous: 30, percentageChange: 0 },
    likes: { current: 250, previous: 200, percentageChange: 25 },
    shares: { current: 20, previous: 25, percentageChange: -20 },
    saved: { current: 210, previous: 150, percentageChange: 40 },
  },
} as unknown as OrganicPost;

const bigNumbersBoosted: OrganicPost = {
  id: 'big-numbers',
  mediaType: 'IMAGE',
  timestamp: '2026-05-01T00:00:00Z',
  isBoosted: true,
  caption:
    'A deliberately very long caption used to check line-clamp-3 truncation behavior across three full lines of wrapped text inside a narrow 340 pixel wide hover card so we can confirm it ellipsizes cleanly without breaking the surrounding layout or pushing other elements around unexpectedly.',
  metrics: {
    reach: 1284000,
    views: 2950000,
    totalInteractions: 184200,
    likes: 150300,
    comments: 12400,
    shares: 8900,
    saved: 12600,
  },
  breakdown7d: days(7, 7, (d) => ({
    views: 400000 + d * 1000,
    reach: 180000 + d * 500,
    engagement: 26000,
    comments: 1800,
    likes: 21000,
    shares: 1200,
    saved: 1700,
  })),
  comparison: {
    views: { current: 2950000, previous: 1200000, percentageChange: 145.8 },
    engagement: { current: 184200, previous: 184200, percentageChange: 0 },
    comments: { current: 12400, previous: 15000, percentageChange: -17.3 },
    likes: { current: 150300, previous: 90000, percentageChange: 67 },
    shares: { current: 8900, previous: 100, percentageChange: 8800 },
    saved: { current: 12600, previous: 12600, percentageChange: 0 },
  },
} as unknown as OrganicPost;

const cases: Array<{ label: string; post: OrganicPost }> = [
  { label: 'Image · full history (comparison-ready)', post: imageFullHistory },
  { label: 'Image · building history (<14d, no comparison yet)', post: imageBuildingHistory },
  { label: 'Image · brand new (no breakdown at all)', post: imageBrandNew },
  { label: 'Reel · full history', post: reelFullHistory },
  { label: 'Carousel · full history', post: carouselFullHistory },
  { label: 'Big numbers + long caption + boosted', post: bigNumbersBoosted },
];

export function PostQuickLookPreview() {
  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <h1 className="mb-6 text-lg font-semibold">PostQuickLook visual QA (temporary)</h1>
      <div className="flex flex-wrap gap-6">
        {cases.map(({ label, post }) => (
          <div key={post.id} className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="w-[340px] rounded-xl border border-subtle bg-popover p-3 text-popover-foreground shadow-xl">
              <PostQuickLook post={post} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
