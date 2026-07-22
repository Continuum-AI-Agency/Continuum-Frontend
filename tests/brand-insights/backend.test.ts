import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapBackendGenerationResponse,
  mapBackendInsightsResponse,
  mapBackendProfileResponse,
  mapBackendStatusMessage,
  mapBackendStatusResponse,
} from '../../src/lib/brand-insights/backend.ts';

test('mapBackendInsightsResponse normalizes snake_case fields', () => {
  const payload = {
    status: 'success',
    generated_at: '2024-07-01T00:00:00Z',
    data: {
      generation_id: 'gen-123',
      trends_and_events: {
        status: 'success',
        trends: [
          {
            id: 'trend-1',
            title: 'AI-driven personalization',
            description: null,
            relevance_to_brand: 'Highly aligned with current campaigns',
            source: 'Forrester',
            is_selected: null,
            times_used: null,
          },
        ],
        events: [
          {
            id: 'event-1',
            title: 'Black Friday',
            date: '2024-11-29',
            description: 'Seasonal spike',
            opportunity: 'Launch gift bundles',
            is_selected: true,
            times_used: 1,
          },
        ],
        country: 'US',
        week_analyzed: '2024-W27',
        generated_at: '2024-07-01T00:00:00Z',
      },
      questions_by_niche: {
        status: 'success',
        questions_by_niche: {
          Fitness: {
            questions: [
              {
                id: 'q1',
                question: 'How do I stay consistent when traveling?',
                social_platform: 'instagram',
                content_type_suggestion: 'story',
                why_relevant: 'Matches brand travel audience',
                is_selected: null,
                times_used: null,
              },
            ],
            total_generated: 1,
          },
        },
        summary: {
          total_niches: 1,
          total_questions: 1,
          average_per_niche: 1,
        },
        generated_at: '2024-07-01T00:00:00Z',
      },
      country: 'US',
      week_start_date: '2024-07-01',
      from_cache: true,
      selected_social_platforms: ['instagram'],
    },
  };

  const result = mapBackendInsightsResponse(payload);

  assert.equal(result.status, 'success');
  assert.equal(result.data.generationId, 'gen-123');
  assert.equal(
    result.data.trendsAndEvents.trends[0].relevanceToBrand,
    'Highly aligned with current campaigns',
  );
  assert.equal(result.data.trendsAndEvents.trends[0].timesUsed, 0);
  assert.equal(result.data.trendsAndEvents.events[0].date, '2024-11-29');
  assert.equal(
    result.data.questionsByNiche.questionsByNiche.Fitness.questions[0].socialPlatform,
    'instagram',
  );
  assert.equal(
    result.data.questionsByNiche.questionsByNiche.Fitness.questions[0].isSelected,
    false,
  );
  assert.equal(result.data.fromCache, true);
  assert.deepEqual(result.data.selectedSocialPlatforms, ['instagram']);
});

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

test('mapBackendInsightsResponse falls back to generation_insights when read windows are empty', () => {
  const payload = {
    status: 'success',
    data: {
      status: 'success',
      brand_id: 'brand-123',
      generation_id: 'gen-legacy',
      anchor_ts: '2026-02-21T18:00:00.000Z',
      windows_days: [7, 30],
      windows: [],
      generation_insights: {
        generation_id: 'gen-legacy',
        week_start_date: '2026-02-17',
        trends_and_events: {
          trends: [{ id: 't1', title: 'UGC momentum' }],
          events: [],
        },
        questions_by_niche: {
          questions_by_niche: {
            Retail: {
              questions: [{ id: 'q1', question_text: 'What should we post tomorrow?' }],
            },
          },
        },
        from_cache: true,
        selected_social_platforms: ['instagram'],
      },
    },
  };

  const result = mapBackendInsightsResponse(payload);

  assert.equal(result.data.generationId, 'gen-legacy');
  assert.equal(result.data.weekStartDate, '2026-02-17');
  assert.equal(result.data.fromCache, true);
  assert.deepEqual(result.data.selectedSocialPlatforms, ['instagram']);
  assert.equal(result.data.trendsAndEvents.trends[0].title, 'UGC momentum');
  assert.equal(
    result.data.questionsByNiche.questionsByNiche.Retail.questions[0].question,
    'What should we post tomorrow?',
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

test('mapBackendProfileResponse maps new strategic analysis fields', () => {
  const payload = {
    status: 'success',
    data: {
      brand_id: 'brand-abc',
      brand_summary: 'Premium fitness brand focused on mobility.',
      brand_foundation: {
        mission: 'Empower everyday athletes',
        vision: 'Movement without pain',
        core_values: ['Consistency', 'Curiosity', ''],
        niches: ['Mobility'],
      },
      niches: ['Strength'],
      audience_profile: {
        summary: 'Busy professionals seeking quick wins',
        pain_points: ['Lack of time'],
        motivations: ['Visible progress'],
        segments: [
          { name: 'Corporate athletes', description: 'Office workers training after hours' },
        ],
      },
      competitive_landscape: {
        top_competitors: [
          {
            name: 'GymCo',
            strategy: 'Price leader',
            messaging: 'Strong every day',
            urls: ['https://gym.co'],
          },
        ],
      },
      brand_voice: {
        tone: 'Encouraging',
        keywords: ['mobile', 'resilient', ''],
        emoji_usage: 'light',
        key_messaging: ['Progress over perfection'],
      },
    },
  };

  const result = mapBackendProfileResponse(payload);

  assert.equal(result.status, 'success');
  assert.equal(result.brandId, 'brand-abc');
  assert.equal(result.mission, 'Empower everyday athletes');
  assert.deepEqual(result.coreValues, ['Consistency', 'Curiosity']);
  assert.deepEqual(result.niches, ['Strength']);
  assert.equal(result.audience?.summary, 'Busy professionals seeking quick wins');
  assert.equal(result.audience?.painsAndFears?.[0], 'Lack of time');
  assert.equal(result.audience?.motivationsAndTriggers?.[0], 'Visible progress');
  assert.equal(result.competitors?.[0].name, 'GymCo');
  assert.equal(result.brandVoice?.tone, 'Encouraging');
  assert.deepEqual(result.brandVoice?.keywords, ['mobile', 'resilient']);
});

test('mapBackendInsightsResponse handles question_text and niche stats', () => {
  const payload = {
    status: 'success',
    data: {
      generation_id: 'gen-abc',
      trends_and_events: {
        trends: [],
        events: [],
      },
      questions_by_niche: {
        questions_by_niche: {
          wellness: {
            questions: [
              {
                id: 'q1',
                question_text: 'How do I stay consistent?',
                social_platform: 'instagram',
                content_type_suggestion: 'Carousel',
                why_relevant: 'Seasonal',
              },
            ],
            stats: { count: 2 },
          },
        },
      },
      country: 'US',
      week_start_date: '2025-11-24',
    },
  };

  const result = mapBackendInsightsResponse(payload);

  assert.equal(result.data.questionsByNiche.questionsByNiche.wellness.totalGenerated, 2);
  assert.equal(
    result.data.questionsByNiche.questionsByNiche.wellness.questions[0].question,
    'How do I stay consistent?',
  );
  assert.equal(result.data.questionsByNiche.summary?.totalQuestions, 2);
  assert.equal(result.data.questionsByNiche.summary?.totalNiches, 1);
});

test('mapBackendInsightsResponse throws when data is null', () => {
  const payload = {
    status: 'not_found',
    message: 'No insights yet',
    data: null,
  };

  assert.throws(() => mapBackendInsightsResponse(payload), /No insights yet/);
});

test('mapBackendProfileResponse gracefully handles onboarding_required', () => {
  const result = mapBackendProfileResponse({
    status: 'onboarding_required',
    data: null,
  });

  assert.equal(result.status, 'onboarding_required');
  assert.equal(result.brandId, undefined);
});

test('mapBackendProfileResponse drops empty competitor rows and voice noise', () => {
  const payload = {
    status: 'success',
    data: {
      brand_id: 'brand-empty',
      brand_foundation: {
        mission: 'Do more with less',
      },
      competitive_landscape: {
        top_competitors: [
          { name: '', strategy: 'missing name', urls: [''] },
          { name: 'Named', primary_url: 'https://example.com', messaging: null, strategy: null },
        ],
      },
      brand_voice: {
        tone: null,
        keywords: [null, 'sharp'],
        emoji_usage: 'minimal',
        key_messaging: [''],
      },
    },
  };

  const result = mapBackendProfileResponse(payload);

  assert.equal(result.competitors?.length, 1);
  assert.equal(result.competitors?.[0].name, 'Named');
  assert.deepEqual(result.brandVoice?.keywords, ['sharp']);
  assert.equal(result.brandVoice?.keyMessaging, undefined);
});

test('mapBackendInsightsResponse falls back to event_date and defaults selection flags', () => {
  const payload = {
    status: 'success',
    data: {
      generation_id: 'gen-xyz',
      trends_and_events: {
        trends: [],
        events: [
          {
            id: 'event-legacy',
            title: 'Launch',
            event_date: '2024-09-01',
          },
        ],
      },
      questions_by_niche: {
        questions_by_niche: {
          Default: {
            questions: [
              {
                id: 'q-legacy',
                question: 'What changed?',
                platform: 'tiktok',
              },
            ],
          },
        },
      },
      week_start_date: '2024-09-01',
    },
  };

  const result = mapBackendInsightsResponse(payload);

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
      trends_and_events: {
        status: 'success',
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
      },
      questions_by_niche: {
        status: 'success',
        questions_by_niche: {
          Marketing: {
            questions: [
              {
                id: 'q-meta-1',
                question: 'Do I need to learn Python in 2026?',
                niche: 'Technical vs. Non-Technical',
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
      },
      week_start_date: '2026-05-01',
    },
  };

  const result = mapBackendInsightsResponse(payload);
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

  assert.equal(question.niche, 'Technical vs. Non-Technical');
  assert.equal(question.confidence, 0.9);
  assert.deepEqual(question.platformDistribution, { instagram: 4, facebook: 1 });
  assert.equal(question.contentTypeSuggestion, 'Talking head video');
});
