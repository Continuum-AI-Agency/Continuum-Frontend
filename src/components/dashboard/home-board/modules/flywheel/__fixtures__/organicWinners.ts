// The organic winners read (GET /api/organic/winners → public.organic_get_winners) for a brand
// with two winners: a reel at 4.2× its account's median reach, still unpromoted, and a carousel
// that already runs as an ad.
import { type OrganicWinners, organicWinnersSchema } from '@continuum/contracts';

const base = {
  accountId: '17841400000000001',
  seenAt: '2026-10-28T15:00:00.000Z',
  capturedDate: '2026-11-02',
  views: null,
  medianHookRate: null,
  ctaText: null,
  hookClass: null,
  ctaClass: null,
  contentFormat: null,
  angleId: null,
  variationJobs: [],
  trial: null,
};

export const TWO_WINNERS: OrganicWinners = organicWinnersSchema.parse({
  brandId: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
  windowDays: 30,
  thresholds: { engagementRateLift: 2, reachLift: 3, minAccountPosts: 5 },
  winners: [
    {
      ...base,
      mediaId: '18000000000000001',
      permalink: 'https://www.instagram.com/reel/ABC123/',
      mediaType: 'VIDEO',
      reach: 48210,
      interactions: 2310,
      engagementRate: 0.048,
      engagementRateLift: 1.6,
      reachLift: 4.2,
      hookRate: 41,
      hookText: 'Tu primer mes por $12',
      promotion: null,
    },
    {
      ...base,
      mediaId: '18000000000000002',
      permalink: null,
      mediaType: 'CAROUSEL_ALBUM',
      reach: 9100,
      interactions: 1210,
      engagementRate: 0.133,
      engagementRateLift: 2.4,
      reachLift: null,
      hookRate: null,
      hookText: null,
      promotion: { creativeIds: ['1200000000001'], adIds: [] },
    },
  ],
});

export const NO_WINNERS: OrganicWinners = { ...TWO_WINNERS, winners: [] };
