import assert from 'node:assert/strict';
import { test } from 'bun:test';

import {
  mapBackendGenerationResponse,
  mapBackendInsightsResponse,
  mapBackendStatusMessage,
  mapBackendStatusResponse,
} from '../../src/lib/brand-insights/backend.ts';

test('mapBackendInsightsResponse maps edge-backed /api/trends/read payload using the 7-day window', () => {
  const payload = {
    status: 'success',
    data: {
      status: 'success',
      brand_id: 'brand-123',
      generation_id: 'gen-edge-1',
      anchor_ts: '2026-02-21T18:00:00.000Z',
      windows_days: [7, 30],
      windows: [
        {
          days: 30,
          window_start: '2026-01-22T00:00:00.000Z',
          window_end: '2026-02-21T00:00:00.000Z',
          counts: { trends: 1, events: 0, questions: 1, generations: 1 },
          trends: [],
          events: [],
          questions: [
            {
              id: 'q-30',
              question_text: 'What long-term behavior changed?',
              niche: 'General',
            },
          ],
          generations: [{ generation_id: 'gen-older' }],
        },
        {
          days: 7,
          window_start: '2026-02-14T00:00:00.000Z',
          window_end: '2026-02-21T00:00:00.000Z',
          counts: { trends: 1, events: 1, questions: 1, generations: 1 },
          trends: [
            {
              id: 'trend-7',
              title: 'Intent-rich search spikes',
              relevance_to_brand: 'High fit',
              is_selected: true,
              times_used: 2,
            },
          ],
          events: [
            {
              id: 'event-7',
              title: 'Presidents Day',
              event_date: '2026-02-16',
              is_selected: false,
            },
          ],
          questions: [
            {
              id: 'q-7',
              question_text: 'How do we react this week?',
              social_platform: 'linkedin',
              niche: 'B2B',
            },
          ],
          generations: [{ generation_id: 'gen-edge-1' }],
        },
      ],
    },
  };

  const result = mapBackendInsightsResponse(payload);
  assert.ok(result);

  assert.equal(result.status, 'success');
  assert.equal(result.generatedAt, '2026-02-21T18:00:00.000Z');
  assert.equal(result.data.generationId, 'gen-edge-1');
  assert.equal(result.data.weekStartDate, '2026-02-14');
  assert.equal(result.data.trendsAndEvents.trends[0].id, 'trend-7');
  assert.equal(result.data.trendsAndEvents.events[0].date, '2026-02-16');
  assert.equal(
    result.data.questionsByNiche.questionsByNiche.B2B.questions[0].socialPlatform,
    'linkedin',
  );
});

test('mapBackendGenerationResponse maps /api/trends processing and success responses', () => {
  const processing = mapBackendGenerationResponse({
    status: 'processing',
    message: 'Trends job started',
    data: {
      job_id: 'job-1',
      generation_id: 'gen-1',
      status: 'running',
      brand_id: 'brand-123',
      stream: {
        transport: 'sse',
        channel: '/api/trends/jobs/gen-1/events',
        queue_name: 'brand_trends_generation_events',
        latest_message_id: 42,
      },
      fallback_poll_url: '/api/trends/jobs/gen-1',
    },
  });

  assert.equal(processing.status, 'processing');
  assert.equal(processing.generationId, 'gen-1');
  assert.equal(processing.jobId, 'job-1');
  assert.equal(processing.jobStatus, 'running');
  assert.equal(processing.brandId, 'brand-123');
  assert.equal(processing.stream?.channel, '/api/trends/jobs/gen-1/events');
  assert.equal(processing.stream?.queueName, 'brand_trends_generation_events');
  assert.equal(processing.stream?.latestMessageId, 42);
  assert.equal(processing.fallbackPollUrl, '/api/trends/jobs/gen-1');

  const success = mapBackendGenerationResponse({
    status: 'success',
    message: 'Trends run completed',
    data: {
      brand_id: 'brand-123',
      generation_id: 'gen-999',
      from_cache: true,
      persisted: { trends: 4, events: 2, questions: 12 },
    },
  });

  assert.equal(success.status, 'success');
  assert.equal(success.brandId, 'brand-123');
  assert.equal(success.generationId, 'gen-999');
  assert.equal(success.fromCache, true);
  assert.equal(success.counts?.trends, 4);
  assert.equal(success.counts?.events, 2);
  assert.equal(success.counts?.questions, 12);
});

test('mapBackendGenerationResponse accepts legacy platform ids', () => {
  const result = mapBackendGenerationResponse({
    status: 'success',
    data: {
      platform_account_id: 'acct-789',
      generation_id: 'gen-789',
      from_cache: false,
    },
  });

  assert.equal(result.brandId, 'acct-789');
  assert.equal(result.generationId, 'gen-789');
  assert.equal(result.fromCache, false);
});

test('mapBackendGenerationResponse supports pending/running start statuses with strategic dependency', () => {
  const pending = mapBackendGenerationResponse({
    status: 'pending',
    message: 'Waiting for strategic analysis',
    dependency: {
      strategic_analysis: {
        required: true,
        status: 'pending',
        run_id: 'run-123',
      },
    },
    data: {
      generation_id: 'gen-pending',
      job_id: 'gen-pending',
      status: 'pending',
    },
  });

  assert.equal(pending.status, 'processing');
  assert.equal(pending.generationId, 'gen-pending');
  assert.equal(pending.jobStatus, 'pending');
  assert.equal(pending.dependencyStrategicAnalysis?.required, true);
  assert.equal(pending.dependencyStrategicAnalysis?.status, 'pending');
  assert.equal(pending.dependencyStrategicAnalysis?.runId, 'run-123');
});

test('mapBackendGenerationResponse preserves the canonical brand-context wait dependency', () => {
  const pending = mapBackendGenerationResponse({
    status: 'processing',
    message: 'Trends job queued until brand context is ready',
    data: {
      generation_id: 'gen-pending',
      job_id: 'gen-pending',
      status: 'pending',
      stage: 'awaiting_brand_context',
      dependency: {
        brand_context: {
          required: true,
          status: 'waiting',
          blockers: ['strategic_analysis_not_completed'],
        },
      },
    },
  });

  assert.equal(pending.status, 'processing');
  assert.equal(pending.stage, 'awaiting_brand_context');
  assert.equal(pending.dependencyBrandContext?.required, true);
  assert.deepEqual(pending.dependencyBrandContext?.blockers, ['strategic_analysis_not_completed']);
});

test('mapBackendStatusResponse normalizes /api/trends job payloads', () => {
  const running = mapBackendStatusResponse({
    status: 'success',
    data: {
      job_id: 'job-1',
      generation_id: 'gen-1',
      brand_id: 'brand-123',
      status: 'running',
      progress_percent: 58,
      stage: 'synthesis',
      stage_message: 'Running synthesis and platform agents',
      totals: {
        trends: 10,
        events: 8,
        questions: 35,
      },
      started_at: '2026-02-22T20:00:00.000Z',
      completed_at: null,
      week_start_date: '2026-02-17',
      error_code: null,
      error_detail: null,
      warnings: { scrape_failures: [], warning_count: 0 },
      competitor: {
        status: 'success',
        source_run_id: 'run-1',
        competitor_count: 3,
        total_ingested: 12,
        reason: null,
      },
      stream: {
        transport: 'sse',
        channel: '/api/trends/jobs/gen-1/events',
        queue_name: 'brand_trends_generation_events',
        latest_message_id: 100,
      },
      error: null,
      metadata: {},
    },
  });

  assert.equal(running.status, 'running');
  assert.equal(running.generationId, 'gen-1');
  assert.equal(running.jobId, 'job-1');
  assert.equal(running.brandId, 'brand-123');
  assert.equal(running.progressPercent, 58);
  assert.equal(running.stage, 'synthesis');
  assert.equal(running.stageMessage, 'Running synthesis and platform agents');
  assert.equal(running.totals?.questions, 35);
  assert.equal(running.weekStartDate, '2026-02-17');
  assert.equal(running.stream?.channel, '/api/trends/jobs/gen-1/events');
  assert.equal(running.stream?.latestMessageId, 100);
  assert.equal(running.warnings?.warningCount, 0);
  assert.equal(running.competitor?.totalIngested, 12);

  const unknown = mapBackendStatusResponse({
    status: 'success',
    data: {
      status: 'bogus',
      generation_id: 'gen-2',
    },
  });

  assert.equal(unknown.status, 'error');
  assert.equal(unknown.generationId, 'gen-2');
});

test('mapBackendStatusResponse tolerates structured error_detail payloads', () => {
  const result = mapBackendStatusResponse({
    status: 'error',
    message: 'Authentication required',
    data: {
      generation_id: 'gen-auth',
      status: 'error',
      error_detail: {
        message: 'Authentication required',
      },
      error: {
        message: 'Authentication required',
      },
    },
  });

  assert.equal(result.status, 'error');
  assert.equal(result.generationId, 'gen-auth');
  assert.equal(result.errorDetail, 'Authentication required');
  assert.equal(result.error, 'Authentication required');
  assert.equal(result.message, 'Authentication required');
});

test('mapBackendStatusMessage normalizes message event payloads', () => {
  const result = mapBackendStatusMessage({
    message_id: 88,
    stage: 'raw_search',
    progress_percent: 34,
    stage_message: 'Collecting raw signals',
    payload: { source_count: 14 },
    created_at: '2026-02-22T20:00:00.000Z',
  });

  assert.equal(result.messageId, 88);
  assert.equal(result.stage, 'raw_search');
  assert.equal(result.progressPercent, 34);
  assert.equal(result.stageMessage, 'Collecting raw signals');
  assert.deepEqual(result.payload, { source_count: 14 });
});

// The exact envelope readTrendsSnapshot (Backend) returns for a brand with no completed generation.
const NO_GENERATION_READ = {
  status: 'success',
  data: {
    status: 'success',
    brand_id: 'brand-new',
    generation_id: null,
    anchor_ts: '2026-11-13T10:00:00.000Z',
    windows_days: [],
    windows: [],
    generation: null,
    generation_insights: null,
    week: null,
    weeks: [],
  },
};

test('mapBackendInsightsResponse maps a brand with no generation yet to null, not an error', () => {
  assert.equal(mapBackendInsightsResponse(NO_GENERATION_READ), null);
});

test('mapBackendInsightsResponse still throws for a generation it cannot place in a week', () => {
  const payload = {
    status: 'success',
    data: { generation_id: 'gen-1', windows_days: [7], windows: [] },
  };
  assert.throws(() => mapBackendInsightsResponse(payload), /missing required generation metadata/);
});

test('mapBackendInsightsResponse throws when data is null', () => {
  const payload = {
    status: 'not_found',
    message: 'No insights yet',
    data: null,
  };

  assert.throws(() => mapBackendInsightsResponse(payload), /No insights yet/);
});

test('mapBackendInsightsResponse falls back to event_date and defaults selection flags', () => {
  const payload = {
    status: 'success',
    data: {
      generation_id: 'gen-xyz',
      anchor_ts: '2024-09-01T12:00:00.000Z',
      generation_insights: {
        trends: [],
        events: [{ id: 'event-1', title: 'Launch', event_date: '2024-09-01' }],
        questions: [{ id: 'q-1', question: 'What changed?', platform: 'tiktok', niche: 'Default' }],
      },
    },
  };

  const result = mapBackendInsightsResponse(payload);
  assert.ok(result);

  assert.equal(result.data.trendsAndEvents.events[0].date, '2024-09-01');
  assert.equal(result.data.trendsAndEvents.events[0].isSelected, false);
  assert.equal(
    result.data.questionsByNiche.questionsByNiche.Default.questions[0].socialPlatform,
    'tiktok',
  );
  assert.equal(
    result.data.questionsByNiche.questionsByNiche.Default.questions[0].isSelected,
    false,
  );
});

test('mapBackendInsightsResponse propagates curated metadata fields on trends, events, and questions', () => {
  const payload = {
    status: 'success',
    data: {
      generation_id: 'gen-meta',
      anchor_ts: '2026-05-01T12:00:00.000Z',
      generation_insights: {
        trends: [
          {
            id: 'trend-meta-1',
            title: 'Omni-Assistant Pivot',
            description: 'Real-time AI partners replacing chatbots.',
            relevance_to_brand: 'Anchors the agency value prop.',
            source: 'OpenAI Spring Update',
            source_url: 'https://openai.com/spring-update',
            confidence: 0.95,
            analysis_tags: ['gpt-4o', 'evidence_scored'],
            source_signal_count: 12,
            signal_window_start: '2026-05-01',
            signal_window_end: '2026-05-08',
            primary_platform: 'linkedin',
            platforms: ['linkedin', 'youtube'],
            metadata: {
              recommended_platforms: ['linkedin', 'youtube', 'x'],
              platform_recommendations: [
                { platform: 'linkedin', reason: 'LatAm professional audience.' },
                { platform: 'youtube', reason: 'Deep-dive tutorials.' },
              ],
            },
          },
        ],
        events: [
          {
            id: 'event-meta-1',
            title: 'Apple WWDC 2026',
            event_date: '2026-06-08',
            description: 'Annual developer conference.',
            opportunity: 'Demystify Apple AI updates.',
            source: 'Apple Developer News',
            source_url: 'https://developer.apple.com/wwdc26',
            confidence: 0.95,
            analysis_tags: ['apple intelligence'],
            source_signal_count: 4,
          },
        ],
        questions: [
          {
            id: 'q-meta-1',
            question: 'Do I need to learn Python in 2026?',
            niche: 'Marketing',
            social_platform: 'instagram',
            content_type_suggestion: 'Talking head video',
            why_relevant: 'Targets imposter syndrome.',
            confidence: 0.9,
            analysis_tags: ['career anxiety'],
            metadata: {
              platform_distribution: { instagram: 4, facebook: 1 },
            },
          },
        ],
      },
    },
  };

  const result = mapBackendInsightsResponse(payload);
  assert.ok(result);
  const trend = result.data.trendsAndEvents.trends[0];
  const event = result.data.trendsAndEvents.events[0];
  const question = result.data.questionsByNiche.questionsByNiche.Marketing.questions[0];

  assert.equal(trend.confidence, 0.95);
  assert.equal(trend.sourceUrl, 'https://openai.com/spring-update');
  assert.equal(trend.sourceSignalCount, 12);
  assert.deepEqual(trend.analysisTags, ['gpt-4o', 'evidence_scored']);
  assert.equal(trend.signalWindowStart, '2026-05-01');
  assert.deepEqual(trend.recommendedPlatforms, ['linkedin', 'youtube', 'x']);
  assert.equal(trend.platformRecommendations?.length, 2);
  assert.equal(trend.platformRecommendations?.[0].platform, 'linkedin');

  assert.equal(event.confidence, 0.95);
  assert.equal(event.opportunity, 'Demystify Apple AI updates.');
  assert.equal(event.sourceUrl, 'https://developer.apple.com/wwdc26');
  assert.equal(event.sourceSignalCount, 4);

  assert.equal(question.niche, 'Marketing');
  assert.equal(question.confidence, 0.9);
  assert.deepEqual(question.platformDistribution, { instagram: 4, facebook: 1 });
  assert.equal(question.contentTypeSuggestion, 'Talking head video');
});
