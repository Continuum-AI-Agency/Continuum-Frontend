import { afterEach, describe, expect, it } from 'bun:test';
import type { AdAccount } from '@continuum/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import vivo47 from '../sections/platforms/__fixtures__/google-vivo47-paid-media-metrics.json';
import { MultiPlatformPickerView } from './MultiPlatformPicker';
import {
  buildGooglePickerGroup,
  googleCampaignEligibility,
  platformCurrencyRefusal,
} from './platformPickerModel';
import { type GoogleInventory, parseGoogleInventory } from './useGooglePickerInventory';

afterEach(cleanup);

const VIVO47: AdAccount = {
  platform: 'google_ads',
  account_id: '3710693645',
  name: 'Vivo 47',
  status: 'ENABLED',
  currency: 'MXN',
};

const AD_GROUPS = {
  rows: [
    {
      id: 'ag-1',
      name: 'EKATAR · Marca',
      hierarchy: { campaign: { id: '20775796216' } },
      metrics: { spend: 20000 },
    },
    {
      id: 'ag-2',
      name: 'EKATAR · Genéricas',
      hierarchy: { campaign: { id: '20775796216' } },
      metrics: { spend: 16000 },
    },
    { id: 'ag-orphan', name: 'No campaign', metrics: { spend: 1 } },
  ],
};

/** The recorded Vivo 47 campaigns (SEARCH + DISPLAY, real), plus the three types the
 *  recording's 7 top-spend rows do not reach: Smart, Video and Performance Max. */
function vivo47Inventory(): GoogleInventory {
  const campaigns = {
    rows: [
      ...vivo47.top_campaigns.rows,
      {
        id: '18572377820',
        name: 'Gimnasio Familiar Premium',
        labels: { channel_type: 'SMART' },
        metrics: { spend: 48.4 },
      },
      {
        id: '22357506361',
        name: 'Video | Vivo 47 | 2025',
        labels: { channel_type: 'VIDEO' },
        metrics: { spend: 0 },
      },
      {
        id: 'pmax-1',
        name: 'PMax · Sedes',
        labels: { channel_type: 'PERFORMANCE_MAX' },
        metrics: { spend: 900 },
      },
    ],
  };
  const inventory = parseGoogleInventory(VIVO47, campaigns, AD_GROUPS);
  if (!inventory) throw new Error('fixture did not parse');
  return inventory;
}

function renderPicker(
  google: Parameters<typeof MultiPlatformPickerView>[0]['google'],
  portfolioCurrency: string | null = 'MXN',
) {
  return render(
    <MultiPlatformPickerView
      google={google}
      metaAccount="act_521903353286118"
      portfolioCurrency={portfolioCurrency}
    >
      <div data-testid="meta-tree">Meta campaigns and ad sets</div>
    </MultiPlatformPickerView>,
  );
}

describe('MultiPlatformPickerView', () => {
  it('leaves a Meta-only brand exactly as today: the Meta tree alone, no headers', () => {
    const { container } = renderPicker({ status: 'none' });
    expect(screen.getByTestId('meta-tree')).toBeDefined();
    expect(screen.queryByTestId('picker-platform-header')).toBeNull();
    expect(container.children).toHaveLength(1);
  });

  it('groups Platform → Campaign → Ad group with each platform’s mark and colour', () => {
    renderPicker({ status: 'ready', inventory: vivo47Inventory() });
    const headers = screen.getAllByTestId('picker-platform-header');
    expect(headers.map((header) => header.dataset.platform)).toEqual(['meta', 'google_ads']);
    expect(headers[0]?.className).toContain('border-platform-meta');
    expect(headers[1]?.className).toContain('border-platform-google');
    expect(headers[1]?.textContent).toContain('Google');
    expect(headers[1]?.textContent).toContain('Vivo 47');
    expect(headers[1]?.querySelector('svg')).not.toBeNull();

    const ekatar = screen
      .getAllByTestId('picker-google-campaign')
      .find((row) => row.textContent?.includes('VIVO 47-EKATAR'));
    expect(ekatar?.dataset.eligible).toBe('true');
    expect(ekatar?.textContent).toContain('Search');
    expect(ekatar?.textContent).toContain('ad group: EKATAR · Marca');
    expect(ekatar?.textContent).toContain('ad group: EKATAR · Genéricas');
  });

  it('shows Smart, Display and Video campaigns disabled with their reason, eligible ones first', () => {
    renderPicker({ status: 'ready', inventory: vivo47Inventory() });
    const rows = screen.getAllByTestId('picker-google-campaign');
    const eligible = rows.filter((row) => row.dataset.eligible === 'true');
    expect(eligible.map((row) => row.textContent?.split('Search')[0])).toContain('VIVO 47-EKATAR');
    const firstDisabled = rows.findIndex((row) => row.dataset.eligible === 'false');
    expect(rows.slice(firstDisabled).every((row) => row.dataset.eligible === 'false')).toBe(true);

    const reasonOf = (name: string) => {
      const row = rows.find((element) => element.textContent?.includes(name));
      expect(row?.getAttribute('aria-disabled')).toBe('true');
      return row ? within(row).getByTestId('picker-disabled-reason').textContent : null;
    };
    expect(reasonOf('Gimnasio Familiar Premium')).toContain('Smart campaigns are outside');
    expect(reasonOf('Remarketing Gourmetería')).toContain('Display campaigns are outside');
    expect(reasonOf('Video | Vivo 47 | 2025')).toBe(
      'Google does not let the API pause or change budgets on Video campaigns. Change it in Google Ads.',
    );
  });

  it('names a Performance Max campaign’s asset groups', () => {
    renderPicker({ status: 'ready', inventory: vivo47Inventory() });
    const pmax = screen
      .getAllByTestId('picker-google-campaign')
      .find((row) => row.textContent?.includes('PMax · Sedes'));
    expect(pmax?.dataset.eligible).toBe('true');
    expect(pmax?.textContent).toContain('Performance Max');
    expect(pmax?.textContent).toContain('Asset groups move with the campaign budget.');
  });

  it('refuses a Google account in another currency, with the reason (decisiones 21)', () => {
    const inventory = { ...vivo47Inventory(), account: { ...VIVO47, currency: 'USD' } };
    renderPicker({ status: 'ready', inventory });
    expect(screen.getByTestId('picker-currency-refusal').textContent).toBe(
      "This Google account bills in USD and the portfolio in MXN. Mixed currencies aren't supported yet.",
    );
    expect(screen.queryAllByTestId('picker-google-campaign')).toHaveLength(0);
  });

  it('refuses Google while the portfolio’s own currency is unknown (escenario 15)', () => {
    renderPicker({ status: 'ready', inventory: vivo47Inventory() }, null);
    expect(screen.getByTestId('picker-currency-refusal').textContent).toBe(
      "This portfolio's currency isn't confirmed, so Google can't be added to it yet.",
    );
  });

  it('says a failed Google read, and keeps the Meta tree', () => {
    renderPicker({ status: 'error', message: 'No Google login' });
    expect(screen.getByTestId('picker-google-error').textContent).toContain('No Google login');
    expect(screen.getByTestId('meta-tree')).toBeDefined();
  });
});

describe('platformPickerModel', () => {
  it('classifies every Google channel type', () => {
    expect(googleCampaignEligibility('SEARCH')).toMatchObject({
      eligible: true,
      childKind: 'ad_group',
    });
    expect(googleCampaignEligibility('PERFORMANCE_MAX')).toMatchObject({
      eligible: true,
      childKind: 'asset_group',
    });
    expect(googleCampaignEligibility('DEMAND_GEN')).toMatchObject({ eligible: true });
    for (const type of ['SMART', 'DISPLAY', 'VIDEO', 'LOCAL', null]) {
      expect(googleCampaignEligibility(type).eligible).toBe(false);
    }
    expect(googleCampaignEligibility('LOCAL').typeLabel).toBe('Local');
  });

  it('accepts a platform in the portfolio’s currency, case-insensitively', () => {
    expect(platformCurrencyRefusal('google_ads', 'MXN', 'mxn')).toBeNull();
    expect(platformCurrencyRefusal('tiktok_ads', 'MXN', 'USD')).toBe(
      "This TikTok account bills in USD and the portfolio in MXN. Mixed currencies aren't supported yet.",
    );
    expect(platformCurrencyRefusal('google_ads', 'MXN', null)).toContain(
      "doesn't report its currency",
    );
  });

  it('drops ad groups without a campaign, and builds the real recording into one group', () => {
    const inventory = vivo47Inventory();
    expect(inventory.adGroups.map((group) => group.id)).toEqual(['ag-1', 'ag-2']);
    const group = buildGooglePickerGroup({
      account: VIVO47,
      portfolioCurrency: 'MXN',
      campaigns: inventory.campaigns,
      adGroups: inventory.adGroups,
    });
    expect(group.refusal).toBeNull();
    expect(group.campaigns).toHaveLength(vivo47.top_campaigns.rows.length + 3);
    expect(group.campaigns[0]?.name).toBe('VIVO 47-EKATAR');
  });

  it('refuses to parse a ranking answer it does not know', () => {
    expect(parseGoogleInventory(VIVO47, { rows: 'x' }, AD_GROUPS)).toBeNull();
  });
});
