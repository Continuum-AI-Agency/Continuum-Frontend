// Shaped like prod on 2026-11-03: a stored competitor awareness report (GET
// /api/competitor-ad-spy/awareness → competitor_ad_spy.awareness_reports.payload) whose lifecycle
// feed is a burst of variants from one gym chain, and an Easy Fit trends read (GET
// /api/trends/read → brand_trends.trends of the latest completed generation). Trend text is
// stored in the account's language and is shown as stored.
import type { AwarenessReportPayload } from '@continuum/contracts';

export const NOW = new Date('2026-11-03T18:00:00.000Z');

export const SMART_FIT = '986771c5-964f-4427-bf33-b8d1598cb128';
export const SPORT_CITY = '5b1d0c2e-1f3a-4c55-9a6e-2d7f8e9a0b1c';

const feedRow = (sourceAdId: string, eventType: string, eventAt: string, competitorId: string) => ({
  sourceAdId,
  eventType,
  eventAt,
  competitorId,
});

export const AWARENESS: AwarenessReportPayload = {
  windowStart: '2026-08-05T01:22:27.077Z',
  windowEnd: '2026-11-03T01:22:27.077Z',
  summary: { newAds: 1, paused: 1, resumed: 0, analyzedActive: 263 },
  blocks: [
    {
      category: 'summary',
      title: 'What changed this period',
      data: { metrics: [{ label: 'New ads', value: 1 }] },
    },
    {
      category: 'lifecycle_feed',
      title: 'Recent ad activity',
      data: {
        rows: [
          feedRow('995171693627124', 'variant_spawned', '2026-11-03T01:21:34.718+00:00', SMART_FIT),
          feedRow(
            '1654895898904266',
            'variant_spawned',
            '2026-11-03T01:21:34.718+00:00',
            SMART_FIT,
          ),
          feedRow(
            '1662000188920442',
            'variant_spawned',
            '2026-11-03T01:21:34.718+00:00',
            SMART_FIT,
          ),
          feedRow('2210443', 'new_ad', '2026-11-01T15:02:00.000+00:00', SPORT_CITY),
          // Older than seven days: listed, never counted in the headline.
          feedRow('88120', 'paused', '2026-10-20T09:00:00.000+00:00', SMART_FIT),
          // A row the renderer cannot read is dropped, not guessed at.
          { eventType: 'new_ad' },
        ],
      },
    },
  ],
};

const trend = (id: string, title: string, confidence: number | null, windowEnd: string) => ({
  id,
  title,
  ...(confidence === null ? {} : { confidence }),
  relevance_to_brand: `Relevance of ${id} to Easy Fit.`,
  signal_window_end: windowEnd,
});

/** The Backend's /api/trends/read envelope for a brand with a completed generation. */
export const TRENDS_READ = {
  status: 'success',
  data: {
    status: 'success',
    brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    generation_id: 'a1c2e3f4-0000-4000-8000-000000000001',
    anchor_ts: '2026-11-02T00:01:13.229Z',
    windows_days: [],
    windows: [],
    generation: null,
    generation_insights: {
      trends: [
        trend('t3', 'Retos de entrenamiento en pareja', 0.9, '2026-10-26'),
        trend('t2', 'Campañas de cadenas de bienestar locales en México', 0.8, '2026-11-02'),
        trend('t4', 'Clases grupales al aire libre', null, '2026-11-02'),
        trend(
          't1',
          'Espacios recreativos que complementan el ejercicio en familia',
          0.85,
          '2026-11-02',
        ),
      ],
      events: [],
      questions: [],
    },
    week: null,
    weeks: [],
  },
};

/** The same read for a brand that never completed a generation. */
export const TRENDS_READ_EMPTY = {
  status: 'success',
  data: {
    status: 'success',
    brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    generation_id: null,
    anchor_ts: '2026-11-03T18:00:00.000Z',
    windows_days: [],
    windows: [],
    generation: null,
    generation_insights: null,
    week: null,
    weeks: [],
  },
};
