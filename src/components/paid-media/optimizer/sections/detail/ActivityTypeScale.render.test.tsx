import { afterEach, describe, expect, it } from 'bun:test';
import type { AdhocSuggestionGate, CreativeSwapJobRow } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';

import { LookbackToggle } from '../../charts/LookbackToggle';
import { CreativeRecommendationCard } from '../CreativeRecommendationCard';
import { RowHeader } from '../feedChrome';
import { DailyReadList } from './DailyReadList';
import type { DailyReadRow } from './dailyReadModel';
import { SuggestionAsk } from './SuggestionAsk';

afterEach(cleanup);

const SUB_XS = /text-(2|3)xs/;

const gate = (
  category: AdhocSuggestionGate['category'],
  canRequest = true,
): AdhocSuggestionGate => ({
  category,
  state: 'none',
  requests_used: 0,
  requests_left: canRequest ? 3 : 0,
  can_request: canRequest,
  retry_after: null,
  reason: canRequest ? null : 'daily_limit',
});

const askedRow: DailyReadRow = {
  id: 'asked-1',
  module: 'audience',
  category: 'Audiences',
  tier: 'low',
  tierLabel: 'Not sized',
  title: 'Find new broad audiences for prospecting',
  reason: 'Delivers leads well below target with low frequency.',
  basis: 'Asked for',
  isHero: false,
  origin: 'asked',
  detail: {
    steps: ['Create new broad prospecting ad sets.', 'Allocate initial test budgets.'],
    figures: [
      { label: 'Spend/day', value: 26.41, unit: 'currency' },
      { label: 'Frequency 7d', value: 1.25, unit: 'multiple' },
    ],
  },
  nextNote: 'Nothing is switched on.',
  cta: { kind: 'build', rowKey: null, label: 'Take this on' },
};

const heroRow: DailyReadRow = {
  id: 'brief-1',
  module: 'pause',
  category: 'Pausing',
  tier: 'high',
  tierLabel: 'High impact',
  title: 'Pause · ITESO // AGOSTO - RTG',
  reason: null,
  basis: 'CPP 14d above the robust reference.',
  isHero: true,
  origin: 'brief',
  cta: { kind: 'queue_row', rowKey: 'rec:1', label: 'Review the pause' },
};

describe('SuggestionAsk — +2 type scale', () => {
  it('gives each of the three options its own icon', () => {
    render(
      <SuggestionAsk
        error="The worker is busy."
        gates={[gate('audience'), gate('budget', false), gate('creative')]}
        onAsk={() => undefined}
        pending={null}
      />,
    );
    for (const category of ['audience', 'budget', 'creative']) {
      const icon = screen.getByTestId(`suggestion-ask-icon:${category}`);
      expect(icon.querySelector('svg')).not.toBeNull();
      expect(icon.className).toContain('size-12');
    }
    expect(screen.getByTestId('suggestion-ask-icon:audience').innerHTML).toContain('lucide-users');
    expect(screen.getByTestId('suggestion-ask-icon:budget').innerHTML).toContain(
      'lucide-arrow-left-right',
    );
    expect(screen.getByTestId('suggestion-ask-icon:creative').innerHTML).toContain(
      'lucide-image-plus',
    );
  });

  it('uses no text-2xs or text-3xs anywhere, notes and error included', () => {
    render(
      <SuggestionAsk
        error="The worker is busy."
        gates={[gate('audience'), gate('budget', false), gate('creative')]}
        onAsk={() => undefined}
        pending={null}
      />,
    );
    const section = screen.getByTestId('suggestion-ask');
    expect(section.outerHTML).not.toMatch(SUB_XS);
    expect(within(section).getByRole('heading').className).toContain('text-xl');
    for (const button of within(section).getAllByRole('button')) {
      expect(button.className).toContain('h-10');
      expect(button.className).toContain('w-full');
    }
  });
});

describe('DailyReadList — +2 type scale', () => {
  it('uses no text-2xs or text-3xs anywhere and shows figures as stat chips', () => {
    render(
      <DailyReadList
        currency="MXN"
        failure={{ rowId: 'asked-1', message: 'Could not build it.' }}
        onCta={() => undefined}
        onDismiss={() => undefined}
        rows={[askedRow, heroRow]}
        source="brief"
      />,
    );
    const section = screen.getByTestId('daily-read');
    expect(section.outerHTML).not.toMatch(SUB_XS);
    expect(screen.getByText(askedRow.title).className).toContain('text-lg');
    const value = screen.getByText('1.25×');
    expect(value.className).toContain('text-lg');
    expect(value.parentElement?.className).toContain('rounded-lg');
    for (const button of within(section).getAllByRole('button')) {
      expect(button.className).toContain('h-10');
    }
  });
});

describe('the shared pieces keep their dense default outside the Activity tab', () => {
  it('LookbackToggle is dense by default and roomy at size lg', () => {
    const { unmount } = render(<LookbackToggle onChange={() => undefined} value={7} />);
    expect(screen.getByText('7d', { selector: 'button' }).className).toContain('text-2xs');
    unmount();
    render(<LookbackToggle onChange={() => undefined} size="lg" value={7} />);
    const roomy = screen.getByText('7d', { selector: 'button' });
    expect(roomy.className).toContain('h-9');
    expect(roomy.className).toContain('text-sm');
    expect(roomy.className).not.toMatch(SUB_XS);
  });

  it('RowHeader keeps the Server log / Activity feed look by default', () => {
    const { unmount } = render(<RowHeader title="Daily budget" ts="2026-08-26T09:00:00Z" />);
    const dense = screen.getByText('Daily budget');
    expect(dense.className).toContain('text-sm');
    expect(dense.className).toContain('font-medium');
    expect((dense.nextElementSibling as HTMLElement).className).toContain('text-xs');
    unmount();
    render(<RowHeader size="lg" title="Daily budget" ts="2026-08-26T09:00:00Z" />);
    const roomy = screen.getByText('Daily budget');
    expect(roomy.className).toContain('text-base');
    expect(roomy.className).toContain('font-semibold');
    expect((roomy.nextElementSibling as HTMLElement).className).toContain('text-sm');
  });
});

describe('CreativeRecommendationCard — +2 type scale (Activity and Actions tabs alike)', () => {
  const creativeRec = {
    id: 'rec-c1',
    adset_id: 'as-1',
    ad_id: 'ad-1',
    kind: 'creative_refresh',
    trigger: 'F1_creative_fatigue',
    severity: 'medium',
    reason: 'CTR down 33% vs 14d',
    status: 'pending',
    evidence: null,
    seed: null,
  } as never;

  const job = (over: Partial<CreativeSwapJobRow>): CreativeSwapJobRow => ({
    id: 'job-1',
    brand_id: 'brand-1',
    recommendation_id: 'rec-c1',
    adset_id: 'as-1',
    mode: 'flash',
    status: 'generated',
    asset_id: 'asset-1',
    result: { roomId: 'room-1' },
    ...over,
  });

  const renderCard = (standing: Parameters<typeof CreativeRecommendationCard>[0]['standing']) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CreativeRecommendationCard
          adsetName="Prospecting MX"
          ads={[{ id: 'ad-1', name: 'Summer hero' }]}
          adsLoading={false}
          audienceType="prospecting"
          brandId=""
          currency="MXN"
          generateNote="Creative+ is busy."
          generating={false}
          implementingKey={null}
          jobs={[
            job({}),
            job({
              id: 'job-2',
              status: 'failed',
              asset_id: null,
              result: null,
              error: { message: 'Quota exceeded' },
              enqueued_via: 'autopilot',
            }),
          ]}
          onGenerate={() => undefined}
          onImplement={() => undefined}
          rec={creativeRec}
          resultWord="leads"
          standing={standing}
          targets={[{ adsetId: 'as-1', name: 'Prospecting MX', relation: 'here' }]}
        />
      </QueryClientProvider>,
    );

  it('uses no text-2xs or text-3xs: slots, badges, notes and the Generate button', () => {
    renderCard(null);
    const card = screen.getByTestId('creative-recommendation-card');
    expect(card.outerHTML).not.toMatch(SUB_XS);
    expect(screen.getByText('Summer hero').className).toContain('text-sm');
    expect(screen.getByText('Generate with Creative+').className).toContain('h-9');
    expect(screen.getByText('Generate with Creative+').className).toContain('text-sm');
    for (const slot of screen.getAllByTestId('flash-slot')) {
      expect(slot.className).toContain('text-xs');
    }
  });

  it("shows the subject creative's cost as a key figure", () => {
    renderCard({
      bars: [
        {
          adId: 'ad-1',
          name: 'Summer hero',
          costPerEvent: 42,
          events: 12,
          spend: 504,
          subject: true,
          winner: false,
          share: 1,
        },
      ],
      median: 42,
      medianShare: 1,
      eligibleAds: 1,
      totalAds: 1,
    });
    const [left, , right] = screen
      .getByTestId('creative-recommendation-card')
      .querySelectorAll(':scope > section');
    expect(left.outerHTML).not.toMatch(SUB_XS);
    expect(right.outerHTML).not.toMatch(SUB_XS);
    const figure = left.querySelector('span.tabular-nums');
    expect(figure?.className).toContain('text-lg');
    expect(figure?.className).toContain('font-semibold');
  });
});
