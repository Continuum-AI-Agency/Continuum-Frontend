import { describe, expect, test } from 'bun:test';
import {
  COMPETITOR_POST_FORMAT_LABELS,
  type Competitor,
  type TimelineEntry,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import {
  boardSaveErrorState,
  competitorApiCode,
  competitorErrorCopy,
} from '@/components/competitors/competitorErrorCopy';
import { formatOutlier } from '@/components/competitors/competitorPostView';
import { formatCount } from '@/components/competitors/postStats';
import { renderToStaticMarkup } from '@/i18n/__tests__/render';
import { competitorStateLabel, localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { ApiError } from '@/lib/api/errors';
import commonEn from '../../../messages/common/en.json';
import commonEs from '../../../messages/common/es.json';
import commonPt from '../../../messages/common/pt-BR.json';
import en from '../../../messages/competitor/en.json';
import es from '../../../messages/competitor/es.json';
import pt from '../../../messages/competitor/pt-BR.json';
import { AdSnapshotCard } from './AdSnapshotCard';
import { formatCompetitorNumber } from './brandVisuals';
import { competitorHealthChip, competitorHealthGuidance } from './competitorHealth';
import { GapBadge } from './report/GapBadge';
import {
  DIMENSION_LABEL,
  FLAG_LABEL,
  GAP_CATEGORY_META,
  money,
  nonUsCountriesLabel,
  percent,
} from './report/gapPresentation';
import { ScanProgress } from './report/ScanProgress';
import { scanCountLabel } from './report/scanCountPresentation';
import { type CompetitorScanState, INITIAL_SCAN_STATE } from './report/scanReducer';

const competitor: Competitor = {
  id: 'competitor-1',
  brandId: 'brand-1',
  name: 'Customer authored name',
  slug: 'customer',
  source: 'user',
  metaPageId: null,
  status: 'active',
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
};
const locales = [
  ['en', en, commonEn],
  ['pt-BR', pt, commonPt],
  ['es', es, commonEs],
] as const;
for (const [locale, messages, common] of locales) {
  const t = createTranslator({
    locale,
    namespace: 'competitor',
    messages: { competitor: messages },
  });
  const render = (children: ReactNode) =>
    renderToStaticMarkup(
      <NextIntlClientProvider
        locale={locale}
        timeZone="UTC"
        messages={{ competitor: messages, common }}
      >
        {children}
      </NextIntlClientProvider>,
    );
  describe(`Competitor presentation ${locale}`, () => {
    test('translates controlled descriptors and health guidance without changing identities or source data', () => {
      const before = structuredClone(competitor);
      const chip = competitorHealthChip(competitor, 0, t);
      expect(chip.state).toBe(competitorHealthChip(competitor, 0).state);
      expect(chip.tone).toBe(competitorHealthChip(competitor, 0).tone);
      expect(chip.label).toBe(localizeCompetitorCopy(competitorHealthChip(competitor, 0).label, t));
      expect(competitorHealthGuidance(chip.state, t)).toBe(
        localizeCompetitorCopy(competitorHealthGuidance(chip.state), t),
      );
      for (const value of [
        ...Object.values(DIMENSION_LABEL),
        ...Object.values(FLAG_LABEL),
        ...Object.values(COMPETITOR_POST_FORMAT_LABELS),
        ...Object.values(GAP_CATEGORY_META).map((item) => item.label),
      ]) {
        expect(Object.values(messages)).toContain(localizeCompetitorCopy(value, t));
      }
      const badge = render(<GapBadge category="they_scale_you_absent" />);
      expect(badge).toContain(
        localizeCompetitorCopy(GAP_CATEGORY_META.they_scale_you_absent.label, t).replaceAll(
          "'",
          '&#x27;',
        ),
      );
      for (const code of [
        'active',
        'paused',
        'analyzing',
        'failed',
        'skipped',
        'queued',
        'pending',
        'processing',
        'done',
        'new_ad',
        'resumed',
        'removed',
        'variant_spawned',
        'copy_changed',
        'sustained_hero',
        'volume_spike',
        'creative_theme_shift',
      ])
        expect(Object.values(messages)).toContain(competitorStateLabel(code, t));
      expect(competitorStateLabel('future_status', t)).toBe('future_status');
      expect(competitorStateLabel('private provider diagnostic', t)).toBe(
        localizeCompetitorCopy('Unknown', t),
      );
      expect(competitor).toEqual(before);
    });
    test('formats native counts, percentages, USD precision and country names independently of stored values', () => {
      expect(formatCount(12500, locale)).toBe(
        new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
          12500,
        ),
      );
      expect(formatOutlier(3.25, locale)).toBe(
        new Intl.NumberFormat(locale, {
          useGrouping: false,
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(3.3) + 'x',
      );
      expect(formatOutlier(12.5, locale)).toBe('13x');
      expect(formatOutlier(null, locale)).toBeNull();
      expect(formatCompetitorNumber(0.00000001, locale)).toBe(
        new Intl.NumberFormat(locale, { maximumSignificantDigits: 21 }).format(0.00000001),
      );
      expect(percent(0.375, locale)).toBe(
        new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(0.38),
      );
      expect(money(12.5, locale)).toBe(
        new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          useGrouping: false,
        }).format(12.5),
      );
      const countries = ['US', 'GB', 'BR'];
      expect(nonUsCountriesLabel(countries, t, locale)).toContain(
        new Intl.DisplayNames(locale, { type: 'region' }).of('GB')!,
      );
      expect(nonUsCountriesLabel(['US'], t, locale)).toBeNull();
      expect(countries).toEqual(['US', 'GB', 'BR']);
    });
    test('localizes all scan counter codes while retaining unknown codes, raw failures and generated taxonomy', () => {
      for (const code of [
        'tracked',
        'promoted',
        'unresolved',
        'resolved',
        'needsReview',
        'competitors',
        'inserted',
        'updated',
        'errors',
        'stored',
        'analyzed',
        'extracted',
        'tagged',
        'relabeled',
        'processed',
        'joined',
        'created',
        'rows',
        'gaps',
      ]) {
        expect(scanCountLabel(code, 1, t, locale)).toContain('1');
        expect(scanCountLabel(code, 2, t, locale)).toContain('2');
      }
      expect(scanCountLabel('future_counter', 1234, t, locale)).toBe(
        formatCompetitorNumber(1234, locale) + ' future_counter',
      );
      const scan: CompetitorScanState = {
        ...INITIAL_SCAN_STATE,
        stages: { sync: { status: 'completed', counts: { competitors: 2, inserted: 3 } } },
        error: 'private provider diagnostic',
        analyzedCreatives: [
          {
            snapshotId: 'snapshot-1',
            hookArchetype: 'AuthoredTaxonomy',
            primaryTheme: 'SourceTheme',
          },
        ],
      };
      const before = structuredClone(scan);
      const html = render(<ScanProgress scan={scan} />);
      expect(html).not.toContain('private provider diagnostic');
      expect(html).toContain('AuthoredTaxonomy');
      expect(html).toContain('SourceTheme');
      expect(scan).toEqual(before);
      const limited = render(
        <ScanProgress
          scan={{ ...scan, transportError: new ApiError('private transport diagnostic', 429) }}
        />,
      );
      expect(limited).toContain(common.rateLimited);
      expect(limited).not.toContain('private transport diagnostic');
    });
    test('renders native ad dates independently of provider timezone and preserves source ad copy', () => {
      const entry: TimelineEntry = {
        snapshotId: '00000000-0000-4000-8000-000000000001',
        competitorId: '00000000-0000-4000-8000-000000000002',
        competitorName: 'Customer name',
        competitorSlug: 'customer',
        sourceAdId: 'source-1',
        firstSeenAt: '2026-08-01T00:30:00Z',
        lastSeenAt: '2026-08-10T00:30:00Z',
        status: 'active',
        snapshotUrl: null,
        imageUrl: null,
        body: 'Source ad text stays in its original language.',
        cta: 'Authored CTA',
        platforms: ['instagram'],
        deliveryStart: null,
        deliveryStop: null,
        hasCreativeMedia: false,
      };
      const before = structuredClone(entry);
      const html = render(
        <NextIntlClientProvider
          locale={locale}
          timeZone="Pacific/Honolulu"
          messages={{ competitor: messages, common }}
        >
          <QueryClientProvider client={new QueryClient()}>
            <AdSnapshotCard entry={entry} />
          </QueryClientProvider>
        </NextIntlClientProvider>,
      );
      expect(html).toContain(
        new Date(entry.firstSeenAt).toLocaleDateString(locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      );
      expect(html).toContain(entry.body!);
      expect(entry).toEqual(before);
    });
    test('uses structured API status and known codes, never provider prose, for action guidance', () => {
      const failure = new ApiError('private diagnostic with 409 inside', 500);
      expect(boardSaveErrorState(failure)).toBe('save_failed');
      expect(boardSaveErrorState(new Error('409'))).toBe('save_failed');
      expect(boardSaveErrorState(new ApiError('conflict', 409))).toBe('already_saved');
      const known = new ApiError('private diagnostic', 409, 'not_analysed');
      expect(competitorApiCode(known)).toBe('not_analysed');
      expect(
        competitorErrorCopy(
          known,
          { not_analysed: 'Analyse the post first.' },
          t,
          () => 'safe fallback',
        ),
      ).toBe(localizeCompetitorCopy('Analyse the post first.', t));
      expect(competitorErrorCopy(failure, {}, t, () => 'safe fallback')).toBe('safe fallback');
      expect(known.message).toBe('private diagnostic');
    });
  });
}
