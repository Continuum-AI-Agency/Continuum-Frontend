/**
 * Browser-path render bench for Brand Trends.
 *
 * The backend `trends:generation:e2e:bench` proves the DB -> backend -> read
 * hops. This bench closes the one hop that a "trends in the DB but not on
 * screen" regression hides in: the Frontend response interpreter. It feeds a
 * real `/api/trends/read` envelope through the REAL `mapBackendInsightsResponse`
 * mapper and asserts the panel would render a non-empty, additive set — the
 * exact failure a unit test on the backend cannot catch.
 *
 * Two modes:
 *   - Fixture (default, CI-green): a realistic weekly-union envelope built to
 *     mirror `readTrendsSnapshot` output, including the low-confidence
 *     "unverified" items the evidence-gate fix now keeps.
 *   - Live (real data): set TRENDS_BENCH_BRAND_ID, TRENDS_BENCH_ACCESS_TOKEN and
 *     CONTINUUM_API_URL to fetch this week's real `/api/trends/read` and map it.
 */
import { currentWeekStartDateUtc } from '@continuum/contracts';
import { mapBackendInsightsResponse } from './backend';

interface RenderCounts {
  trends: number;
  events: number;
  questions: number;
}

function renderedCounts(rendered: ReturnType<typeof mapBackendInsightsResponse>): RenderCounts {
  const trends = rendered.data.trendsAndEvents.trends.length;
  const events = rendered.data.trendsAndEvents.events.length;
  const questions =
    rendered.data.questionsByNiche.summary?.totalQuestions ??
    Object.values(rendered.data.questionsByNiche.questionsByNiche).reduce(
      (total, niche) => total + niche.questions.length,
      0,
    );
  return { trends, events, questions };
}

/** Minimal DB-row-shaped trend as `generation_insights` carries it. */
function trendRow(id: string, title: string, unverified: boolean) {
  return {
    id,
    title,
    description: `${title} — a concrete, brand-aligned angle worth publishing this week.`,
    relevance_to_brand: 'Matches the education-forward voice and current audience interest.',
    primary_platform: 'instagram',
    platforms: ['instagram'],
    confidence: unverified ? 0.35 : 0.72,
    source: unverified ? 'unverified' : 'exa',
    source_url: unverified ? null : 'https://example.com/evidence',
    analysis_tags: unverified ? ['low_evidence_unverified'] : ['evidence_E1'],
  };
}

function eventRow(id: string, title: string) {
  return {
    id,
    title,
    event_date: null,
    description: `${title} is a relevant activation window.`,
    opportunity: 'Publish an educational series around the moment.',
    primary_platform: 'instagram',
    platforms: ['instagram'],
    confidence: 0.4,
    analysis_tags: ['activation_window_undated'],
  };
}

function questionRow(id: string, niche: string, question_text: string) {
  return {
    id,
    niche,
    question_text,
    why_relevant: 'Directly supports the product-education strategy.',
    social_platform: 'instagram',
    social_platforms: ['instagram'],
    confidence: 0.6,
    analysis_tags: [],
  };
}

/**
 * A weekly read envelope shaped exactly like `readTrendsSnapshot` output: two
 * completed attempts collapsed into one deduped `generation_insights` union
 * (five trends, not one attempt's three), with `week.mode === 'additive'`.
 */
function buildUnionEnvelope() {
  const weekStartDate = currentWeekStartDateUtc(new Date('2026-07-15T00:00:00Z'));
  const completedAt = '2026-07-15T06:00:44.000Z';
  const latestGenId = '11111111-1111-4111-8111-111111111111';
  const initialGenId = '22222222-2222-4222-8222-222222222222';
  return {
    status: 'success',
    generated_at: completedAt,
    data: {
      status: 'success',
      brand_id: 'bench-brand',
      generation_id: latestGenId,
      anchor_ts: completedAt,
      windows_days: [],
      windows: [],
      generation: { id: latestGenId, week_start_date: weekStartDate, status: 'completed' },
      generation_insights: {
        trends: [
          trendRow('t1', 'Ingredient myth-busting carousels', false),
          trendRow('t2', 'Barrier-repair routines for teens', false),
          trendRow('t3', 'Fragrance-free swaps explainer', false),
          trendRow('t4', 'Dermatologist duet reactions', true),
          trendRow('t5', 'SPF reapplication field guide', true),
        ],
        events: [
          eventRow('e1', 'National Skin Health Week'),
          eventRow('e2', 'Back-to-school sensitive-skin push'),
          eventRow('e3', 'End-of-summer barrier reset'),
        ],
        questions: [
          questionRow('q1', 'ingredient education', 'which actives are safe for sensitive skin?'),
          questionRow('q2', 'ingredient education', 'how do I layer a barrier serum?'),
          questionRow('q3', 'routine building', 'what is a minimal teen routine?'),
          questionRow('q4', 'routine building', 'how often should I reapply SPF indoors?'),
        ],
      },
      week: {
        week_start_date: weekStartDate,
        mode: 'additive',
        generation_count: 2,
        generations: [
          { id: latestGenId, metadata: { generation_kind: 'regeneration' } },
          { id: initialGenId, metadata: { generation_kind: 'initial' } },
        ],
      },
      weeks: [
        {
          week_start_date: weekStartDate,
          generation_count: 2,
          regeneration_count: 1,
          latest_generation_id: latestGenId,
          latest_completed_at: completedAt,
        },
        {
          // PostgREST offset-form timestamp (`+00:00`, no `Z`) — parses at the
          // input schema but the strict contracts week schema rejects the offset,
          // so an un-canonicalized value throws the whole read mapping and blanks
          // the panel. This week is the regression guard for normalizeTimestamp.
          week_start_date: '2026-02-23',
          generation_count: 1,
          regeneration_count: 0,
          latest_generation_id: initialGenId,
          latest_completed_at: '2026-02-23T22:10:02.331+00:00',
        },
      ],
    },
  };
}

function assertAtLeast(actual: RenderCounts, min: RenderCounts, label: string): void {
  for (const key of ['trends', 'events', 'questions'] as const) {
    if (actual[key] < min[key]) {
      throw new Error(
        `${label}: rendered ${actual[key]} ${key}, expected >= ${min[key]} — the panel would show an empty/collapsed section.`,
      );
    }
  }
}

async function runFixture(): Promise<void> {
  const rendered = mapBackendInsightsResponse(buildUnionEnvelope());
  const counts = renderedCounts(rendered);

  // The union carries five trends across two attempts; a single-generation
  // collapse (the previously-deferred bug) would render only three. Asserting
  // exactly five locks the additive render in place.
  if (counts.trends !== 5) {
    throw new Error(
      `Fixture: additive union rendered ${counts.trends} trends, expected the full deduped 5 (single-generation collapse regression).`,
    );
  }
  assertAtLeast(counts, { trends: 5, events: 3, questions: 4 }, 'Fixture');

  const unverifiedRendered = rendered.data.trendsAndEvents.trends.some((trend) =>
    (trend.analysisTags ?? []).includes('low_evidence_unverified'),
  );
  if (!unverifiedRendered) {
    throw new Error(
      'Fixture: low-confidence "unverified" trends were dropped by the mapper — the no_trends_generated fix would be undone at render.',
    );
  }

  // The offset-form historical week must survive and be canonicalized to `Z`;
  // an un-normalized `+00` timestamp would have thrown the whole read mapping.
  const historicalWeek = rendered.data.weeks?.find((week) => week.weekStartDate === '2026-02-23');
  if (!historicalWeek || historicalWeek.latestCompletedAt !== '2026-02-23T22:10:02.331Z') {
    throw new Error(
      `Fixture: offset-form week timestamp not canonicalized (got ${historicalWeek?.latestCompletedAt ?? 'missing'}); a real brand's history would blank the panel.`,
    );
  }
  console.log(
    `Fixture render PASS — ${counts.trends} trends (2 unverified) · ${counts.events} events · ${counts.questions} questions.`,
  );
}

async function runLive(): Promise<boolean> {
  const apiBaseUrl = process.env.CONTINUUM_API_URL?.replace(/\/$/, '');
  const brandId = process.env.TRENDS_BENCH_BRAND_ID?.trim();
  const accessToken = process.env.TRENDS_BENCH_ACCESS_TOKEN?.trim();
  if (!apiBaseUrl || !brandId || !accessToken) {
    console.log(
      'Live render hop SKIPPED — set CONTINUUM_API_URL, TRENDS_BENCH_BRAND_ID and TRENDS_BENCH_ACCESS_TOKEN to map a real /api/trends/read response.',
    );
    return false;
  }

  const response = await fetch(`${apiBaseUrl}/api/trends/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ brand_id: brandId, week_start_date: currentWeekStartDateUtc() }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Live /api/trends/read failed (${response.status}): ${raw.slice(0, 240)}`);
  }

  const rendered = mapBackendInsightsResponse(JSON.parse(raw) as unknown);
  const counts = renderedCounts(rendered);
  assertAtLeast(counts, { trends: 1, events: 1, questions: 1 }, 'Live');
  console.log(
    `Live render PASS — brand ${brandId}: ${counts.trends} trends · ${counts.events} events · ${counts.questions} questions rendered from real /api/trends/read.`,
  );
  return true;
}

async function main(): Promise<void> {
  console.log('TRENDS RENDER BENCH (browser-path FE mapper)');
  await runFixture();
  const liveRan = await runLive();
  console.log(
    liveRan
      ? 'RESULT: PASS (fixture + live real-data render).'
      : 'RESULT: PASS (fixture only — live render hop not exercised; see skip note above).',
  );
}

main().catch((error) => {
  console.error(`TRENDS RENDER BENCH FAIL — ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
