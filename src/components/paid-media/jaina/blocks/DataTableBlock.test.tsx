import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { DataTableBlockV2 } from '@/lib/jaina/schemas';

const requestPreview = mock(async () => ({
  thumbnail_url: 'https://cdn.example.com/analyzed-creative.jpg',
  image_url: null,
}));

mock.module('@/lib/api/http', () => ({
  http: { request: requestPreview },
}));

const { DataTableBlock } = await import('./DataTableBlock');

afterEach(() => {
  cleanup();
  requestPreview.mockClear();
});

const baseBlock: DataTableBlockV2 = {
  block_id: 'creative-table',
  category: 'data_table',
  scope: 'account',
  title: 'Winning creatives',
  priority: 'primary',
  provenance: null,
  columns: [
    { key: 'creative', label: 'Creative', format: 'creative', align: 'left' },
    { key: 'headline', label: 'Headline', format: 'text', align: 'left' },
    { key: 'placement', label: 'Placement', format: 'text', align: 'left' },
    { key: 'spend', label: 'Spend', format: 'currency', align: 'right' },
    { key: 'cpa', label: 'Cost per result', format: 'currency', align: 'right' },
    { key: 'impressions', label: 'Impressions', format: 'number', align: 'right' },
  ],
  rows: [
    {
      creative: 'Spring launch',
      headline: 'Move with confidence',
      placement: null,
      spend: 1250,
      cpa: null,
      impressions: 98231,
    },
  ],
  notes: 'Based on the selected reporting window.',
  dataset_id: 'dataset-1',
  row_meta: [{ currency: 'EUR' }],
  render_mode: 'creative_cards',
  card_fields: {
    creative: 'creative',
    title: 'headline',
    subtitle: 'placement',
    metrics: ['spend', 'cpa'],
  },
};

describe('DataTableBlock', () => {
  it('renders only explicitly mapped creative-card fields with column labels and formats', () => {
    render(<DataTableBlock block={baseBlock} isStreaming={false} />);

    const list = screen.getByRole('list', { name: 'Winning creatives' });
    const card = within(list).getByRole('article', { name: 'Move with confidence' });

    expect(within(card).getByRole('heading', { name: 'Move with confidence' })).toBeTruthy();
    expect(within(card).getByText('Preview unavailable')).toBeTruthy();
    expect(within(card).getByText('Spend')).toBeTruthy();
    expect(within(card).getByText('€1,250.00')).toBeTruthy();
    expect(within(card).getByText('Cost per result')).toBeTruthy();
    expect(within(card).getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('Impressions')).toBeNull();
    expect(screen.queryByText('98,231')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Based on the selected reporting window.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Data provenance' })).toBeTruthy();
  });

  it('leaves ordinary data tables unchanged', () => {
    render(
      <DataTableBlock
        block={{ ...baseBlock, render_mode: 'table', card_fields: null }}
        isStreaming={false}
      />,
    );

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Impressions' })).toBeTruthy();
    expect(within(table).getByText('98,231')).toBeTruthy();
    expect(within(table).getByText('€1,250.00')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Winning creatives' })).toBeNull();
  });

  it('renders supplied currency and zero values without inventing a fallback currency', () => {
    const row = { ...baseBlock.rows[0], spend: 0 };
    const { rerender } = render(
      <DataTableBlock
        block={{ ...baseBlock, rows: [row], row_meta: [{ currency: 'GBP' }] }}
        isStreaming={false}
      />,
    );

    expect(screen.getByText('£0.00')).toBeTruthy();

    rerender(
      <DataTableBlock block={{ ...baseBlock, rows: [row], row_meta: [{}] }} isStreaming={false} />,
    );

    expect(screen.getByText('0 (currency unknown)')).toBeTruthy();
    expect(screen.queryByText('$0.00')).toBeNull();
  });

  it('exposes bounded typed audience evidence without inferring missing identities', () => {
    const block: DataTableBlockV2 = {
      ...baseBlock,
      render_mode: 'table',
      card_fields: null,
      columns: [
        { key: 'angle', label: 'Angle', format: 'text', align: 'left' },
        {
          key: 'audience_coverage',
          label: 'Audience coverage',
          format: 'text',
          align: 'left',
        },
      ],
      rows: [{ angle: 'Trust', audience_coverage: 'partial (75% of spend)' }],
      row_meta: [
        {
          currency: 'EUR',
          audience: {
            label: 'Measured audiences',
            source: 'paid_creative_angle_evidence',
            coverage: 'partial',
            temporalBasis: 'current',
            coveredAds: 3,
            eligibleAds: 4,
            coveredSpend: 750,
            spendCoverage: 0.75,
            segments: [
              {
                audienceCellId: 'audience-cell-1',
                observedAt: '2026-09-12T12:00:00Z',
                source: 'meta_graph',
                adsetCount: 2,
                eligibleAds: 3,
                spend: 750,
                spendShare: 0.75,
                targetingBasis: 'current',
                ageMin: 25,
                ageMax: 44,
                genders: [2],
                geoCount: 2,
                customAudienceCount: 1,
                excludedCustomAudienceCount: 0,
                geoNodeIds: ['US-CO', 'US-UT'],
                customAudienceIds: ['customers-90d'],
                excludedCustomAudienceIds: [],
                publisherPlatforms: ['facebook', 'instagram'],
                placements: ['feed', 'reels'],
                devicePlatforms: ['mobile'],
              },
            ],
          },
        },
      ],
    };

    render(<DataTableBlock block={block} isStreaming={false} />);

    expect(screen.getByText('Audience evidence: Partial')).toBeTruthy();
    expect(screen.getByText('3 of 4 eligible ads')).toBeTruthy();
    expect(screen.getByText('€750.00 covered spend (75%)')).toBeTruthy();
    expect(screen.getByText('Current targeting')).toBeTruthy();
    expect(screen.getByText('US-CO, US-UT')).toBeTruthy();
    expect(screen.getByText('customers-90d')).toBeTruthy();
    expect(screen.queryByText(/lookalike/i)).toBeNull();
  });

  it('keeps unknown audience evidence visibly qualified and empty', () => {
    render(
      <DataTableBlock
        block={{
          ...baseBlock,
          render_mode: 'table',
          card_fields: null,
          columns: [
            {
              key: 'audience_coverage',
              label: 'Audience coverage',
              format: 'text',
              align: 'left',
            },
          ],
          rows: [{ audience_coverage: 'unknown' }],
          row_meta: [
            {
              audience: {
                label: null,
                source: null,
                coverage: 'unknown',
                temporalBasis: 'unknown',
                coveredAds: 0,
                eligibleAds: 0,
                coveredSpend: 0,
                spendCoverage: null,
                segments: [],
              },
            },
          ],
        }}
        isStreaming={false}
      />,
    );

    expect(screen.getByText('Audience evidence unknown')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('keeps analyzed creative previews visible through the existing creative card', async () => {
    render(
      <DataTableBlock
        block={{
          ...baseBlock,
          row_meta: [
            {
              currency: 'EUR',
              creative: {
                ad_id: 'ad-1',
                ad_account_id: 'act-1',
                brand_id: 'brand-1',
              },
            },
          ],
        }}
        isStreaming={false}
      />,
    );

    const image = await screen.findByRole('img', { name: 'Move with confidence' });
    expect(image.getAttribute('src')).toBe('https://cdn.example.com/analyzed-creative.jpg');
    expect(requestPreview).toHaveBeenCalledTimes(1);
  });

  // The entity column used to BE the id (`campaign-1202…`) because the Backend had
  // no name to put there. Now it carries the name, so the id has to stay visible —
  // it is what a user pastes into Ads Manager.
  it('renders the row entity id under the first column, and only there', () => {
    render(
      <DataTableBlock
        block={{
          ...baseBlock,
          render_mode: 'table',
          card_fields: null,
          columns: [
            { key: 'entity', label: 'Entity', format: 'text', align: 'left' },
            { key: 'headline', label: 'Headline', format: 'text', align: 'left' },
          ],
          rows: [{ entity: 'ITESO // TOURS // SEPTIEMBRE', headline: 'Move with confidence' }],
          row_meta: [{ entity_id: '120243403769620322', entity_type: 'campaign' }],
        }}
        isStreaming={false}
      />,
    );

    expect(screen.getAllByText('120243403769620322')).toHaveLength(1);
    expect(screen.getByText('ITESO // TOURS // SEPTIEMBRE')).toBeDefined();
  });

  it('renders no id line when the row carries no entity_id', () => {
    render(
      <DataTableBlock
        block={{
          ...baseBlock,
          render_mode: 'table',
          card_fields: null,
          columns: [{ key: 'entity', label: 'Entity', format: 'text', align: 'left' }],
          rows: [{ entity: 'Campaign one' }],
          row_meta: [{ currency: 'EUR' }],
        }}
        isStreaming={false}
      />,
    );

    expect(screen.getByText('Campaign one')).toBeDefined();
    expect(screen.queryAllByText(/^\d{10,}$/)).toHaveLength(0);
  });
});
