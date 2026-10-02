import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CardAdAngle } from './creativeCardModel';
import { adAnglesQueryKey } from './useAdAngles';

// The subject thumbnails are signed Meta URLs that expire; the card recovers them through
// the shared hook. The hook is replaced so a test can see which ad asked and hand back a URL.
const recovered: string[] = [];
let freshUrlById: Record<string, string> = {};
const recover = (adId: string) => {
  recovered.push(adId);
};
mock.module('@/hooks/usePaidCreativeRecovery', () => ({
  usePaidCreativeRecovery: () => ({ freshUrlById, recover }),
}));

const { CreativeRecommendationCard } = await import('./CreativeRecommendationCard');

afterEach(() => {
  cleanup();
  recovered.length = 0;
  freshUrlById = {};
});

// Easy Fit (brand 6f597f42-…), ad set 120252387195420236: three price offers, each labelled
// value_stack by the coarse hookArchetype — the real rows paid_media_get_ad_angles returns.
const BRAND = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const ADSET = '120252387195420236';
const row = (ad_id: string, hook: string, over: Partial<CardAdAngle> = {}): CardAdAngle => ({
  ad_id,
  adset_id: ADSET,
  angle: 'value_stack',
  hook,
  rationale: null,
  themes: [],
  analyzed_at: '2026-09-30T10:00:00Z',
  ...over,
});
const easyFit = [
  row('120252387195440236', 'Tu primer mes por solo $12'),
  row('120252387195460236', '50% de descuento en tu anualidad'),
  row('120252387195450236', 'Entrena desde $249 en Ávila Camacho'),
];
const ads = easyFit.map((r) => ({
  id: r.ad_id,
  name: `Ad ${r.ad_id.slice(-4)}`,
  status: 'ACTIVE',
}));

// The F1 trigger writes no seed: before this card read the angles RPC it always said
// "not labelled yet".
const fatigueRec = {
  id: 'rec-f1',
  adset_id: ADSET,
  ad_id: null,
  kind: 'creative_refresh',
  trigger: 'F1_creative_fatigue',
  severity: 'medium',
  reason: 'CTR down 29% vs 14d',
  status: 'pending',
  evidence: {
    metric: 'ctr',
    value: 0.0032,
    comparator: 'down 29% vs 14d',
    threshold: 0.0045,
    window: 'd3',
    estImpactPerDay: null,
    source: 'engine',
  },
  seed: null,
} as never;

const window = (spend: number, leads: number, clicks: number, impressions: number) => ({
  spend,
  leads,
  clicks,
  impressions,
});
const snapshot = {
  id: ADSET,
  status: 'active',
  currentBudget: 68.28,
  ageDays: 30,
  windows: {
    d3: window(393, 3, 32, 10000),
    d7: window(700, 7, 90, 20000),
    d14: window(1400, 14, 180, 40000),
  },
} as never;

function renderCard(rows: CardAdAngle[] | null, props: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (rows) client.setQueryData(adAnglesQueryKey(BRAND, ADSET), rows);
  const card = () => (
    <QueryClientProvider client={client}>
      <CreativeRecommendationCard
        adAccountId="act_123"
        ads={ads}
        adsLoading={false}
        adsetName="AV CAMACHO // AGOSTO - LKL - Mensajes"
        audienceType="prospecting"
        brandId={rows ? BRAND : ''}
        currency="MXN"
        generateNote={null}
        generating={false}
        implementingKey={null}
        jobs={[]}
        kpiField="leads"
        onGenerate={() => undefined}
        onImplement={() => undefined}
        rec={fatigueRec}
        resultWord="leads"
        snapshot={snapshot}
        standing={null}
        targets={[]}
        {...props}
      />
    </QueryClientProvider>
  );
  const view = render(card());
  return { ...view, rerenderCard: () => view.rerender(card()) };
}

describe('CreativeRecommendationCard — layout A', () => {
  it('reads as two tiles: what is wearing out, and what to make', () => {
    renderCard(easyFit);
    const problem = screen.getByTestId('creative-card-problem');
    const prescription = screen.getByTestId('creative-card-prescription');
    expect(within(problem).getByText('What’s wearing out')).toBeTruthy();
    expect(within(problem).getByText('Engagement is decaying while cost rises.')).toBeTruthy();
    expect(within(prescription).getByText('What to make')).toBeTruthy();
    expect(within(prescription).getByText('Refresh the creative')).toBeTruthy();
    expect(within(prescription).getByText('Generate with Creative+')).toBeTruthy();
    expect(within(prescription).getAllByText(/^slot \d$/)).toHaveLength(3);
  });

  it('labels the angle as the communication angle, never as a bare word', () => {
    renderCard(easyFit);
    const angleRow = screen.getByTestId('angle-row');
    expect(within(angleRow).getByText('Angle')).toBeTruthy();
    const chip = within(angleRow).getByTestId('angle-chip');
    expect(chip.getAttribute('aria-label')).toBe(
      'Communication angle: Leaning: Everything you get',
    );
    expect(screen.queryByText(/not labelled yet/i)).toBeNull();
  });

  it('draws a confirmed angle as a solid chip and keeps it on the right', () => {
    renderCard(easyFit.map((r) => ({ ...r, angle_id: 'offer_discount' })));
    const chip = within(screen.getByTestId('angle-row')).getByTestId('angle-chip');
    expect(chip.textContent).toBe('Discount offer');
    expect(chip.getAttribute('aria-label')).toBe('Communication angle: Discount offer');
    expect(chip.getAttribute('title')).toBe('Communication angle: Discount offer');
    expect(chip.className).toContain('border-primary');
    expect(chip.className).not.toContain('border-dashed');
    const prescription = screen.getByTestId('creative-card-prescription');
    expect(within(prescription).getByText(/Keep the angle:/)).toBeTruthy();
    expect(within(prescription).getByText('Discount offer')).toBeTruthy();
  });

  it('draws a leaning dashed, with its share and an unconfirmed explanation', () => {
    renderCard(
      easyFit.map((r) => ({ ...r, angle_leaning: 'value_stack', angle_leaning_share: 0.5 })),
    );
    const chip = within(screen.getByTestId('angle-row')).getByTestId('angle-chip');
    expect(chip.textContent).toBe('Leaning: Everything you get · 50%');
    expect(chip.className).toContain('border-dashed');
    expect(chip.getAttribute('title')).toContain('not confirmed');
  });

  it('says "Not classified yet" when there is no angle anywhere', () => {
    renderCard([]);
    const chip = within(screen.getByTestId('angle-row')).getByTestId('angle-chip');
    expect(chip.textContent).toBe('Not classified yet');
    expect(screen.queryByText(/not labelled yet/i)).toBeNull();
    expect(screen.queryByText(/Keep the angle/)).toBeNull();
  });

  it('shows each ad its own angle when the shown ads disagree', () => {
    renderCard([
      { ...easyFit[0], angle_id: 'offer_discount' },
      { ...easyFit[1], angle_id: 'offer_discount' },
      easyFit[2],
    ] as CardAdAngle[]);
    const problem = screen.getByTestId('creative-card-problem');
    const chips = within(problem).getAllByTestId('angle-chip');
    expect(chips).toHaveLength(4);
    expect(within(screen.getByTestId('angle-row')).getByTestId('angle-chip').textContent).toBe(
      'Discount offer',
    );
  });

  it('quotes the subject ad’s hook', () => {
    renderCard(easyFit, { rec: { ...(fatigueRec as object), ad_id: '120252387195460236' } });
    expect(screen.getByTestId('angle-hook').textContent).toBe('“50% de descuento en tu anualidad”');
  });

  it('draws the CTR windows to scale and flags the worn-out one against the 14-day level', () => {
    renderCard(easyFit);
    const bars = screen.getByTestId('wear-out-bars');
    const rows = within(bars).getAllByRole('listitem');
    expect(rows.map((li) => li.firstElementChild?.textContent)).toEqual([
      '14 days',
      '7 days',
      '3 days',
    ]);
    const widths = within(bars)
      .getAllByTestId('wear-out-fill')
      .map((fill) => (fill as HTMLElement).style.width);
    expect(widths[0]).toBe('100%');
    expect(Number.parseFloat(widths[2] ?? '')).toBeCloseTo(71.1, 0);
    expect(rows[2]?.getAttribute('data-flagged')).toBe('true');
    expect(within(rows[2] as HTMLElement).getByTestId('wear-out-baseline')).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText('0.32%').className).toContain(
      'text-destructive',
    );
    expect(screen.getByTestId('cost-change-chip').textContent).toBe('cost per result +31%');
  });

  it('a subject ad with no image asks for a fresh one and shows a placeholder meanwhile', () => {
    renderCard(easyFit, { rec: { ...(fatigueRec as object), ad_id: '120252387195460236' } });
    const problem = screen.getByTestId('creative-card-problem');
    expect(within(problem).getByTestId('subject-ad-placeholder')).toBeTruthy();
    expect(within(problem).queryByRole('img')).toBeNull();
    expect(recovered).toEqual(['120252387195460236']);
  });

  it('an expired subject thumbnail recovers through the preview endpoint, never showing alt text', () => {
    const expired = ads.map((ad) => ({
      ...ad,
      creative: { imageUrl: `https://cdn.meta.test/${ad.id}-expired.jpg` },
    }));
    const { container, rerenderCard } = renderCard(easyFit, {
      ads: expired,
      rec: { ...(fatigueRec as object), ad_id: '120252387195440236' },
    });
    const thumb = () =>
      container.querySelector('[data-testid="creative-card-problem"] img') as HTMLImageElement;
    expect(thumb().getAttribute('alt')).toBe('');
    expect(recovered).toEqual([]);
    fireEvent.error(thumb());
    expect(recovered).toEqual(['120252387195440236']);
    expect(screen.getByTestId('subject-ad-placeholder')).toBeTruthy();
    expect(thumb()).toBeNull();
    freshUrlById = { '120252387195440236': 'https://cdn.meta.test/fresh.jpg' };
    rerenderCard();
    expect(thumb().src).toBe('https://cdn.meta.test/fresh.jpg');
    expect(screen.queryByTestId('subject-ad-placeholder')).toBeNull();
  });
});
