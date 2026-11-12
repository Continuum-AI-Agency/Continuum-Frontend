import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { render } from '@/i18n/__tests__/render';
import { buildSeriesSet } from '@/lib/organic/blendAccounts';
import type { SnapshotAccountResult } from '@/lib/organic/brandOrganicSnapshot';
import { summarizeDraftMedia } from '@/lib/organic/draftMediaSummary';
import { buildOrganicCreativeRows } from '@/lib/organic/organic-creative-rows';
import commonEn from '../../../../messages/common/en.json';
import commonEs from '../../../../messages/common/es.json';
import commonPt from '../../../../messages/common/pt-BR.json';
import en from '../../../../messages/organic/en.json';
import es from '../../../../messages/organic/es.json';
import pt from '../../../../messages/organic/pt-BR.json';
import { buildPlannerDraftDeepLink, presentAgentMessage } from '../agent/presentAgentMessage';
import {
  formatTrendWindowDays,
  getTrendScanSummary,
  TrendChartCard,
} from '../agent/TrendChartCard';
import type { UiTrendChart } from '../agent/types';
import { rankCardMedia } from '../hooks/useDraftStoryboard';
import type { OrganicCalendarDraft } from '../primitives/types';
import { type AccountsByPlatform, MetricsScopeSelector } from './MetricsScopeSelector';

afterEach(cleanup);
const uuid = '68fe1000-1111-4111-8111-111111111111';
const chart: UiTrendChart = {
  chartType: 'bar',
  title: '',
  windows: [],
  series: [],
  topSignals: [
    {
      id: 'signal-1',
      title: 'Authored signal title',
      type: 'question',
      confidence: 0.825,
      platform: 'instagram',
      windowDays: Number.NaN,
    },
  ],
};
const account = (id: string): SnapshotAccountResult => ({
  status: 'ok',
  platform: 'instagram',
  integrationAccountId: id,
  name: 'All selected (Σ)',
  metrics: { views: 1234.5 },
  comparison: null,
  trends: [{ date: '2026-08-24', views: 1234.5 }],
  range: { preset: 'last_7d', since: '2026-08-24', until: '2026-08-25' },
});
const draft = (overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft => ({
  id: 'draft-1',
  title: 'Blueprint: 2 frames',
  summary: 'Generated output stays unchanged.',
  timeLabel: '9 AM',
  dateLabel: 'Monday',
  status: 'draft',
  platforms: ['instagram'],
  format: 'Post',
  objective: 'Draft',
  captionPreview: 'No media yet',
  tags: [],
  mediaCount: 0,
  ...overrides,
});

for (const [locale, organic, common] of [
  ['en', en, commonEn],
  ['pt-BR', pt, commonPt],
  ['es', es, commonEs],
] as const) {
  const t = createTranslator({
    locale,
    namespace: 'organic',
    messages: { organic },
    onError: (error) => {
      throw error;
    },
  });
  const wrap = (children: ReactNode) => (
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={{ organic, common }}
      onError={(error) => {
        throw error;
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
  describe(`Residual Organic presentation ${locale}`, () => {
    test('changes only app-owned Markdown link/generation labels and preserves deep-link bytes and surrounding generated text', () => {
      const before = `Generated English body. Draft ID: ${uuid}. Another draft ${uuid}. Retry job ${uuid}. **Keep this authored Markdown.**`;
      const link = buildPlannerDraftDeepLink(uuid);
      const actual = presentAgentMessage(before, t);
      expect(actual).toBe(
        `Generated English body. ${t('messagePlannerDraft', { url: link })}. Another ${t('messagePlannerReference', { url: link })}. Retry ${t('messageCurrentGeneration')}. **Keep this authored Markdown.**`,
      );
      expect(actual.match(/\/organic\?tab=planner&draftId=/g)).toHaveLength(2);
      expect(before).toContain(`Draft ID: ${uuid}`);
      expect(presentAgentMessage('Authored text with no canonical ID reference.', t)).toBe(
        'Authored text with no canonical ID reference.',
      );
    });

    test('localizes chart fallback windows, units, type/count copy and rounded confidence while preserving source facts', () => {
      const before = structuredClone(chart);
      const summary = getTrendScanSummary(chart, { translate: t, locale });
      expect(summary.title).toBe(t('trendScanTitle'));
      expect(summary.windowLabel).toBe(t('trendWindowCurrent'));
      for (const days of [7, 365, 730])
        expect(formatTrendWindowDays(days, locale)).toBe(
          new Intl.NumberFormat(locale, {
            style: 'unit',
            unit: days >= 365 ? 'year' : 'day',
            unitDisplay: 'narrow',
          }).format(days >= 365 ? days / 365 : days),
        );
      const view = render(wrap(<TrendChartCard chart={chart} />));
      fireEvent.click(view.getByRole('button'));
      expect(view.getByText('Authored signal title')).toBeTruthy();
      expect(view.getByText(t('trendSignalType', { kind: 'question' }))).toBeTruthy();
      expect(view.container.textContent).toContain(
        new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: 0,
          useGrouping: false,
        }).format(0.83),
      );
      expect(chart).toEqual(before);
      const authored = { ...chart, title: 'Trend scan' };
      expect(getTrendScanSummary(authored, { translate: t, locale }).title).toBe('Trend scan');
    });

    test('localizes only preview alt names and leaves realized names/URLs/media bytes/stages untouched', () => {
      const input = {
        idPrefix: 'preview:raw-id',
        realized: [],
        preview: ['https://signed/one', 'https://signed/two'],
        previewStale: false,
        storyboard: [],
        format: 'Carousel',
      };
      const legacy = rankCardMedia(input);
      const actual = rankCardMedia({ ...input, translate: t });
      expect(actual.media.map(({ name: _, ...rest }) => rest)).toEqual(
        legacy.media.map(({ name: _, ...rest }) => rest),
      );
      expect(actual.media[1].name).toBe(
        t('draftPreviewName', { format: 'carousel', index: 2, total: 2 }),
      );
      const realized = [
        {
          id: 'raw',
          kind: 'image' as const,
          url: 'https://stored/file',
          name: 'Post preview 1 of 1',
        },
      ];
      expect(rankCardMedia({ ...input, realized, translate: t }).media).toBe(realized);
      expect(
        rankCardMedia({ ...input, format: 'Source authored format', translate: t }).media[0].name,
      ).toContain('Source authored format');
    });

    test('localizes blended series labels with identical query keys, colors, totals and chart rows', () => {
      const accounts = [account('account-1'), account('account-2')];
      const before = structuredClone(accounts);
      const legacy = buildSeriesSet({ accounts, metricId: 'views', mode: 'both' });
      const actual = buildSeriesSet({ accounts, metricId: 'views', mode: 'both', translate: t });
      expect(actual.chartRows).toEqual(legacy.chartRows);
      expect(actual.series.map(({ label: _, ...rest }) => rest)).toEqual(
        legacy.series.map(({ label: _, ...rest }) => rest),
      );
      expect(actual.series.find((series) => series.kind === 'platform_blend')?.label).toBe(
        t('blendPlatformCount', { platform: 'Instagram', count: 2 }),
      );
      expect(actual.series.find((series) => series.kind === 'selection_blend')?.label).toBe(
        t('blendSelectionAll'),
      );
      expect(
        actual.series
          .filter((series) => series.kind === 'account')
          .every((series) => series.label.includes('All selected (Σ)')),
      ).toBe(true);
      expect(accounts).toEqual(before);
    });

    test('localizes hook insights and empty titles without changing metric precision, ranking or authored captions', () => {
      const posts = [
        { id: 'high', caption: 'Untitled post', metrics: { reach: 5000.125, hookRate: 40.4 } },
        { id: 'low', metrics: { reach: 3000, hookRate: 20 } },
      ];
      const before = structuredClone(posts);
      const legacy = buildOrganicCreativeRows({ posts, metric: 'reach' });
      const actual = buildOrganicCreativeRows({ posts, metric: 'reach', translate: t, locale });
      expect(actual.map(({ name: _, insightLine: __, ...rest }) => rest)).toEqual(
        legacy.map(({ name: _, insightLine: __, ...rest }) => rest),
      );
      expect(actual[0].name).toBe('Untitled post');
      expect(actual[1].name).toBe(t('creativeUntitledPost'));
      expect(actual[0].insightLine).toContain(
        new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: 0,
          useGrouping: false,
        }).format(0.4),
      );
      expect(actual[0].insightLine).toContain(
        new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: 0,
          useGrouping: false,
          signDisplay: 'exceptZero',
        }).format(Math.round(actual[0].vsAveragePct!) / 100),
      );
      expect(posts).toEqual(before);
    });

    test('localizes media plurals and blueprint summaries with the same reusable IDs, files and source draft', () => {
      for (const input of [
        draft(),
        draft({
          publishingAssets: [
            {
              role: 'primary',
              kind: 'image',
              storagePath: 'one',
              storageUrl: 'https://signed/one',
            },
            {
              role: 'primary',
              kind: 'video',
              storagePath: 'two',
              storageUrl: 'https://signed/two',
            },
          ],
        }),
        draft({
          mediaSuggestion: {
            storyboard: [
              { storageUrl: 'https://storyboard/one' },
              { storageUrl: 'https://storyboard/two' },
            ],
          },
        }),
      ]) {
        const before = structuredClone(input);
        const legacy = summarizeDraftMedia(input);
        const actual = summarizeDraftMedia(input, t);
        const { label: _, ...facts } = actual;
        const { label: __, ...originalFacts } = legacy;
        expect(facts).toEqual(originalFacts);
        expect(actual.label).toBe(
          actual.imageCount || actual.videoCount
            ? t('draftMediaInventory', {
                kind:
                  actual.imageCount && actual.videoCount
                    ? 'mixed'
                    : actual.imageCount
                      ? 'image'
                      : 'video',
                images: actual.imageCount,
                videos: actual.videoCount,
              })
            : actual.blueprintFrames
              ? t('draftMediaBlueprint', { count: actual.blueprintFrames })
              : t('draftMediaEmpty'),
        );
        expect(input).toEqual(before);
      }
    });

    test('names toggle-all accessibly in the UI locale while emitting original account/platform scope IDs', async () => {
      const accountsByPlatform: AccountsByPlatform = {
        instagram: [
          { platform: 'instagram', integrationAccountId: 'raw-a', name: 'Account one' },
          { platform: 'instagram', integrationAccountId: 'raw-b', name: 'Account two' },
        ],
        facebook: [],
        tiktok: [],
        youtube: [],
        linkedin: [],
        x: [],
      };
      const accounts = mock((_keys: string[]) => {});
      const platforms = mock((_platforms: string[]) => {});
      const view = render(
        wrap(
          <MetricsScopeSelector
            mode="multi"
            accountsByPlatform={accountsByPlatform}
            selectedAccountKeys={['instagram:raw-a']}
            onSelectedAccountKeysChange={accounts}
            onSelectedPlatformsChange={platforms}
          />,
        ),
      );
      await act(async () => {
        fireEvent.click(view.getByRole('combobox'));
      });
      await act(async () => {
        fireEvent.click(
          view.getByRole('option', { name: t('selectPlatform', { platform: 'Instagram' }) }),
        );
      });
      expect(accounts).toHaveBeenCalledWith(['instagram:raw-a', 'instagram:raw-b']);
      expect(platforms).toHaveBeenCalledWith(['instagram']);
    });
  });
}
