import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { bulkContentPlanSchema } from '@continuum/contracts';
import { cleanup, fireEvent } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import type { CompetitorPostView } from '@/components/competitors/competitorPostView';
import { PostMetrics } from '@/components/competitors/postStats';
import { BulkPlanCard } from '@/components/organic/agent/BulkPlanCard';
import { SocialPostFrame } from '@/components/organic/primitives/SocialPostFrame';
import { render } from '@/i18n/__tests__/render';
import * as navigation from '@/i18n/navigation';
import {
  brandInsightsEventSchema,
  brandInsightsQuestionsByNicheSchema,
  brandInsightsTrendSchema,
} from '@/lib/schemas/brandInsights';
import commonEn from '../../../messages/common/en.json';
import commonEs from '../../../messages/common/es.json';
import commonPt from '../../../messages/common/pt-BR.json';
import competitorEn from '../../../messages/competitor/en.json';
import competitorEs from '../../../messages/competitor/es.json';
import competitorPt from '../../../messages/competitor/pt-BR.json';
import organicEn from '../../../messages/organic/en.json';
import organicEs from '../../../messages/organic/es.json';
import organicPt from '../../../messages/organic/pt-BR.json';
import { BrandEventsList } from './BrandEventsList';
import { BrandQuestionsList } from './BrandQuestionsList';
import { BrandTrendsGrid } from './BrandTrendsGrid';

const push = mock((_href: string) => {});
let router: ReturnType<typeof spyOn<typeof navigation, 'useRouter'>>;
beforeEach(() => {
  router = spyOn(navigation, 'useRouter').mockReturnValue({
    push,
    replace: () => {},
    refresh: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
  });
  push.mockClear();
});
afterEach(() => {
  cleanup();
  router.mockRestore();
});
const id = '68fe1000-1111-4111-8111-111111111111';
const bulk = bulkContentPlanSchema.parse({
  planId: 'bulk-raw',
  kind: 'bulk',
  title: 'Authored plan title',
  strategyBrief: {
    summary: 'Generated source narrative.',
    pillars: [{ name: 'Authored pillar' }],
    mix: [
      { format: 'post', weight: 0.5 },
      { format: 'reel', weight: 0.5 },
    ],
    platformSplit: [{ platform: 'instagram', weight: 1 }],
    cadencePerDayPerPlatform: 1,
    horizonWeeks: 1,
  },
  schedule: { horizonWeeks: 1, postsPerDayPerPlatform: 1 },
  placements: [
    {
      specId: 'spec-raw',
      platform: 'instagram',
      format: 'post',
      pillar: 'Authored pillar',
      angle: 'Authored angle',
      hook: 'Authored hook',
      objective: 'save',
      trendId: null,
    },
  ],
});
const metrics: CompetitorPostView = {
  competitorId: 'raw-c',
  competitorName: 'Authored competitor',
  instagramUsername: 'raw_handle',
  format: 'talking_head',
  analysis: null,
  relevance: null,
  whyItWorked: null,
  post: {
    id: 'post-raw',
    shortcode: 'raw',
    permalink: 'https://instagram.com/reel/raw/',
    kind: 'reel',
    coverUrl: 'https://cdn.test/raw',
    caption: 'Authored caption',
    timestamp: '2026-11-11T00:00:00Z',
    likeCount: 1,
    commentsCount: 2,
    viewCount: 12345,
    mediaCount: 1,
    items: [{ kind: 'video', url: 'https://cdn.test/raw.mp4' }],
  },
};

for (const [locale, common, organic, competitor] of [
  ['en', commonEn, organicEn, competitorEn],
  ['pt-BR', commonPt, organicPt, competitorPt],
  ['es', commonEs, organicEs, competitorEs],
] as const) {
  const tc = createTranslator({
    locale,
    namespace: 'common',
    messages: { common },
    onError: (error) => {
      throw error;
    },
  });
  const to = createTranslator({
    locale,
    namespace: 'organic',
    messages: { organic },
    onError: (error) => {
      throw error;
    },
  });
  const tp = createTranslator({
    locale,
    namespace: 'competitor',
    messages: { competitor },
    onError: (error) => {
      throw error;
    },
  });
  const wrap = (children: ReactNode) => (
    <NextIntlClientProvider
      locale={locale}
      timeZone="Pacific/Honolulu"
      messages={{ common, organic, competitor }}
      onError={(error) => {
        throw error;
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
  test(`${locale}: brand trend controls/plurals preserve generated title and canonical planner deep links`, () => {
    const trends = [
      brandInsightsTrendSchema.parse({
        id,
        title: 'No trends yet',
        description: 'Authored English report body.',
        recommendedPlatforms: ['instagram'],
      }),
    ];
    const before = structuredClone(trends);
    const view = render(wrap(<BrandTrendsGrid trends={trends} />));
    expect(view.getByText('No trends yet')).toBeTruthy();
    expect(view.getByText(tc('insightCount', { kind: 'trends', count: 1 }))).toBeTruthy();
    expect(view.getByPlaceholderText(tc('insightSearchTrends'))).toBeTruthy();
    fireEvent.click(
      view.getByRole('button', { name: tc('generate_content_from_this_trend_ebcebff') }),
    );
    expect(push).toHaveBeenCalledWith(`/organic?composeTrendId=${id}&composePlatform=instagram`);
    expect(trends).toEqual(before);
  });
  test(`${locale}: event/question tables use whole counts and native empty/search labels without translating source narratives`, () => {
    const events = [
      brandInsightsEventSchema.parse({
        id: 'event-raw',
        title: 'Authored event',
        opportunity: 'Source opportunity text',
      }),
    ];
    const view = render(wrap(<BrandEventsList events={events} />));
    expect(view.getByText(tc('insightCount', { kind: 'events', count: 1 }))).toBeTruthy();
    expect(view.getByText(tc('insightNoDate'))).toBeTruthy();
    fireEvent.change(view.getByPlaceholderText(tc('insightSearchEvents')), {
      target: { value: 'nonmatching-query' },
    });
    expect(view.getByText(tc('insightCount', { kind: 'events', count: 0 }))).toBeTruthy();
    view.unmount();
    const data = brandInsightsQuestionsByNicheSchema.parse({
      questionsByNiche: {
        'Authored audience': {
          questions: [{ id: 'question-raw', question: 'Authored question?' }],
        },
      },
    }).questionsByNiche;
    const before = structuredClone(data);
    const questions = render(wrap(<BrandQuestionsList questionsByNiche={data} />));
    expect(questions.getByText(tc('insightCount', { kind: 'questions', count: 1 }))).toBeTruthy();
    expect(questions.getByText('Authored question?')).toBeTruthy();
    expect(data).toEqual(before);
  });
  test(`${locale}: bulk plan mix and approval chrome preserve raw plan/format weights and dispatch once`, () => {
    const before = structuredClone(bulk);
    const approve = mock(() => {});
    const view = render(
      wrap(<BulkPlanCard plan={bulk} onApproveAction={approve} onRejectAction={() => {}} />),
    );
    expect(view.getByText('Authored plan title')).toBeTruthy();
    expect(view.container.textContent).toContain(to('publishFormatPOST'));
    expect(view.container.textContent).toContain(
      new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(0.5),
    );
    fireEvent.click(view.getByRole('button', { name: to('bulkApproveGenerate') }));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(bulk).toEqual(before);
  });
  test(`${locale}: caption accessibility and platform decoration localize while source caption/account names stay intact`, () => {
    let changed = '';
    const props = {
      platform: 'instagram' as const,
      frame: { kind: 'feed' as const, mediaAspect: 1 },
      caption: 'Authored caption',
      brandName: 'Your Brand',
      mediaNode: null,
      editable: true,
      onCaptionChange: (value: string) => {
        changed = value;
      },
    };
    const view = render(wrap(<SocialPostFrame {...props} />));
    const field = to('socialCaptionField', { platform: 'Instagram', kind: 'caption' });
    fireEvent.click(view.getByRole('button', { name: to('editCaptionField', { field }) }));
    fireEvent.change(view.getByRole('textbox', { name: field }), {
      target: { value: 'Raw author text remains English.' },
    });
    expect(changed).toBe('Raw author text remains English.');
    view.rerender(wrap(<SocialPostFrame {...props} platform="linkedin" editable={false} />));
    expect(view.container.textContent).toContain('Your Brand');
    expect(view.getByText(to('socialActionLabel', { action: 'Like' }))).toBeTruthy();
  });
  test(`${locale}: competitor metric IDs/data values remain original while accessible words/counts are localized`, () => {
    const before = structuredClone(metrics);
    const view = render(wrap(<PostMetrics view={metrics} />));
    for (const [metric, value, key] of [
      ['views', 12345, 'm_978e15fd0e'],
      ['likes', 1, 'm_9ab560b8c2'],
      ['comments', 2, 'm_5643f7d54f'],
    ] as const) {
      const node = view.container.querySelector(`[data-metric="${metric}"]`);
      expect(node?.getAttribute('data-value')).toBe(String(value));
      expect(node?.textContent).toContain(tp(key, { count: value }));
    }
    expect(metrics).toEqual(before);
  });
}
