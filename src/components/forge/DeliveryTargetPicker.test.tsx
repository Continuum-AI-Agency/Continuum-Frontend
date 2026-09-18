/**
 * The Meta half of the Deliver step against a stubbed paid-targets route. Nothing here can reach
 * Meta: `publishingApi.searchPaid` is the only door and it is mocked. What this guards:
 *
 * - the campaign → ad set → ad drill-down records a replace target with names, status and the
 *   creative the person saw;
 * - pasted ad ids resolve to names (label⇥id lines and bare ids in row order), and a miss is an
 *   inline error on its line;
 * - a spreadsheet `{action:'replace', adId}` resolves on its own and blocks until it does;
 * - no ad account is a clear empty state, and a stale target there must be cleared.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  ApiRenderDeliveryDestinationsResponse,
  ApiRenderDeliveryTarget,
  ApiRenderTemplateContract,
  PaidCanvasTarget,
} from '@continuum/contracts';

const target = (
  item: Partial<PaidCanvasTarget> & Pick<PaidCanvasTarget, 'id' | 'level' | 'name'>,
) =>
  ({
    status: 'ACTIVE',
    campaignId: null,
    campaignName: null,
    adsetId: null,
    adsetName: null,
    creativeId: null,
    format: null,
    previewUrl: null,
    ...item,
  }) satisfies PaidCanvasTarget;

const CAMPAIGN = target({ id: 'c1', level: 'campaign', name: 'Summer launch' });
const ADSET = target({
  id: 's1',
  level: 'adset',
  name: 'Spain 18–34',
  status: 'PAUSED',
  campaignId: 'c1',
  campaignName: 'Summer launch',
});
const AD_ONE = target({
  id: '1201',
  level: 'ad',
  name: 'Hero story',
  status: 'PAUSED',
  campaignId: 'c1',
  campaignName: 'Summer launch',
  adsetId: 's1',
  adsetName: 'Spain 18–34',
  creativeId: 'cr_1',
});
const AD_TWO = target({
  id: '1202',
  level: 'ad',
  name: 'Hero square',
  campaignId: 'c1',
  campaignName: 'Summer launch',
  adsetId: 's1',
  adsetName: 'Spain 18–34',
  creativeId: 'cr_2',
});

const searchPaidMock = mock(
  async (input: { level: string; parentId?: string; cursor?: string; query?: string }) => {
    const page = (items: PaidCanvasTarget[], nextCursor: string | null = null) => ({
      adAccountId: 'act_1',
      items,
      nextCursor,
    });
    if (input.level === 'campaign') return page([CAMPAIGN]);
    if (input.level === 'adset') return page(input.parentId === 'c1' ? [ADSET] : []);
    if (input.parentId) return page(input.parentId === 's1' ? [AD_ONE, AD_TWO] : []);
    // The account-wide id lookup pages: one ad per page proves it follows the cursor.
    return input.cursor ? page([AD_TWO]) : page([AD_ONE], 'page-2');
  },
);

mock.module('@/StudioCanvas/nodes/publish/publishingApi', () => ({
  publishingApi: { searchPaid: searchPaidMock },
}));
mock.module('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  chooseOption,
  installPickerDomGlobals,
  openSelect,
} from '@/components/automations/workspace/pickers/pickerTestHarness';
import type React from 'react';
import { useState } from 'react';
import {
  DeliveryTargetPicker,
  type MetaPickerState,
  metaDeliveryProblems,
  parseAdIdLines,
  replaceTargetFor,
} from './DeliveryTargetPicker';
import type { RenderPreflightRow } from './RenderPreflightDialog';

const BRAND = '22222222-2222-4222-8222-222222222222';
const OUTPUTS = [
  { id: 'square', label: 'Square', ratio: '1:1' },
  { id: 'story', label: 'Story', ratio: '9:16' },
] as ApiRenderTemplateContract['outputs'];
const CONNECTED: ApiRenderDeliveryDestinationsResponse['meta'] = {
  connected: true,
  adAccountId: 'act_1',
  adAccountName: 'StarCraft Ads',
};

const ROWS: RenderPreflightRow[] = [
  { rowId: 'root', label: 'Root', labelPath: ['Root'], outputIds: [] },
  { rowId: 'spain', label: 'Spain', labelPath: ['Root', 'Spain'], outputIds: ['story'] },
];

let latest: { rows: RenderPreflightRow[]; formats: Record<string, string> } = {
  rows: [],
  formats: {},
};

function Harness({ meta, rows = ROWS }: { meta: MetaPickerState; rows?: RenderPreflightRow[] }) {
  const [current, setCurrent] = useState(rows);
  const [formats, setFormats] = useState<Record<string, string>>({});
  latest = { rows: current, formats };
  return (
    <DeliveryTargetPicker
      brandId={BRAND}
      meta={meta}
      rows={current}
      outputs={OUTPUTS}
      formatByRow={formats}
      onDeliveryChange={(rowId, delivery) =>
        setCurrent((all) =>
          all.map((row) =>
            row.rowId === rowId ? { ...row, delivery: delivery ?? undefined } : row,
          ),
        )
      }
      onFormatChange={(rowId, outputId) => setFormats((all) => ({ ...all, [rowId]: outputId }))}
    />
  );
}

afterEach(() => {
  cleanup();
  searchPaidMock.mockClear();
});

installPickerDomGlobals();

describe('parseAdIdLines', () => {
  test('maps label⇥id lines by label or path and bare ids by row order, naming bad lines', () => {
    const { assignments, errors } = parseAdIdLines(
      ['root / spain\t1202', '', '1201', 'Italy\t1300', 'Root\t', '1400', '1500'].join('\n'),
      ROWS,
    );
    expect(assignments).toEqual([
      { line: 1, rowId: 'spain', adId: '1202' },
      { line: 3, rowId: 'root', adId: '1201' },
      { line: 6, rowId: 'spain', adId: '1400' },
    ]);
    expect(errors).toEqual([
      { line: 4, message: 'no row named “Italy”' },
      { line: 5, message: 'no ad ID after the tab' },
      { line: 7, message: 'more ad IDs than rows (2)' },
    ]);
  });
});

describe('replace rules', () => {
  test('a looked-up ad becomes a named replace target pinned to the creative seen', () => {
    expect(replaceTargetFor('act_1', AD_ONE)).toEqual({
      action: 'replace',
      adAccountId: 'act_1',
      campaignId: 'c1',
      campaignName: 'Summer launch',
      adsetId: 's1',
      adsetName: 'Spain 18–34',
      adId: '1201',
      adName: 'Hero story',
      adStatus: 'PAUSED',
      expectedCreativeId: 'cr_1',
    });
    expect(replaceTargetFor('act_1', { ...AD_ONE, adsetId: null })).toBeNull();
  });

  test('a replacing row with several formats blocks until one is chosen', () => {
    const replace = replaceTargetFor('act_1', AD_ONE) as ApiRenderDeliveryTarget;
    const rows = [
      { ...ROWS[0]!, delivery: replace },
      { ...ROWS[1]!, delivery: replace },
    ];
    expect(metaDeliveryProblems(rows, OUTPUTS, {}, CONNECTED)).toEqual([
      'Choose one format for each ad replacement.',
    ]);
    // Spain already renders one format, so only Root needs the choice.
    expect(metaDeliveryProblems(rows, OUTPUTS, { root: 'square' }, CONNECTED)).toEqual([]);
    expect(
      metaDeliveryProblems(rows, OUTPUTS, { root: 'square' }, { ...CONNECTED, connected: false }),
    ).toEqual(['Clear the ad targets — this brand has no ad account connected.']);
  });

  test('ad targets wait for the ad account check; rows without one never do', () => {
    const replace = replaceTargetFor('act_1', AD_ONE) as ApiRenderDeliveryTarget;
    const rows = [{ ...ROWS[0]!, delivery: replace }, ROWS[1]!];
    expect(metaDeliveryProblems(rows, OUTPUTS, { root: 'square' }, 'loading')).toEqual([
      'Checking for an ad account…',
    ]);
    expect(metaDeliveryProblems([ROWS[0]!, ROWS[1]!], OUTPUTS, {}, 'loading')).toEqual([]);
  });
});

describe('DeliveryTargetPicker', () => {
  test('drills campaign → ad set → ad and forces one format on the replacing row', async () => {
    render(<Harness meta={CONNECTED} />);
    expect(screen.getByText(/Ad account: StarCraft Ads/)).toBeTruthy();
    expect(screen.getByText(/Nothing changes in Ads Manager until someone approves/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Replace an ad for Root' }));
    fireEvent.click(await screen.findByRole('button', { name: /Summer launch/ }));
    const adset = await screen.findByRole('button', { name: /Spain 18–34/ });
    expect(adset.textContent).toContain('Paused');
    fireEvent.click(adset);
    fireEvent.click(await screen.findByRole('button', { name: /Hero story/ }));

    await waitFor(() =>
      expect(latest.rows[0]?.delivery).toEqual(replaceTargetFor('act_1', AD_ONE)),
    );
    expect(searchPaidMock.mock.calls.map((call) => [call[0].level, call[0].parentId])).toEqual([
      ['campaign', undefined],
      ['adset', 'c1'],
      ['ad', 's1'],
    ]);
    expect(screen.getByText('Hero story')).toBeTruthy();

    // Root renders every format, so replacing an ad asks for exactly one.
    expect(metaDeliveryProblems(latest.rows, OUTPUTS, latest.formats, CONNECTED)).toHaveLength(1);
    openSelect('Format for Root');
    chooseOption('Story');
    expect(latest.formats).toEqual({ root: 'story' });
    expect(metaDeliveryProblems(latest.rows, OUTPUTS, latest.formats, CONNECTED)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove the ad target for Root' }));
    expect(latest.rows[0]?.delivery).toBeUndefined();
    expect(screen.queryByRole('combobox', { name: 'Format for Root' })).toBeNull();
  }, 30_000);

  test('pasted ad ids resolve to names across pages; a miss is an error on its line', async () => {
    render(<Harness meta={CONNECTED} />);
    fireEvent.click(screen.getByRole('button', { name: /Paste ad IDs/ }));
    fireEvent.change(screen.getByLabelText('Ad IDs'), {
      target: { value: 'Spain\t1202\n9999\n' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply ad IDs' }));

    expect(await screen.findByText('Matched 1 ad.')).toBeTruthy();
    expect(
      screen.getByText('Line 2: ad 9999 isn’t a paused or active ad in this account'),
    ).toBeTruthy();
    expect(latest.rows[1]?.delivery).toEqual(replaceTargetFor('act_1', AD_TWO));
    expect(latest.rows[0]?.delivery).toBeUndefined();
    // One lookup, two pages: AD_TWO sits on the second.
    expect(searchPaidMock.mock.calls.map((call) => call[0].cursor)).toEqual([undefined, 'page-2']);
  }, 30_000);

  test('a spreadsheet ad id resolves to its names on its own', async () => {
    // The exact shape RenderRequestsGrid sends for a spreadsheet "Replace ad ID" cell.
    const bare: ApiRenderDeliveryTarget = {
      action: 'replace',
      adId: '1201',
      adAccountId: '',
      campaignId: '',
      adsetId: '',
    };
    render(<Harness meta={CONNECTED} rows={[{ ...ROWS[1]!, delivery: bare }]} />);
    expect(metaDeliveryProblems(latest.rows, OUTPUTS, {}, CONNECTED)).toEqual(['Resolve 1 ad ID.']);
    await waitFor(() =>
      expect(latest.rows[0]?.delivery).toEqual(replaceTargetFor('act_1', AD_ONE)),
    );
    expect(screen.getByText('Hero story')).toBeTruthy();
    expect(metaDeliveryProblems(latest.rows, OUTPUTS, {}, CONNECTED)).toEqual([]);
  }, 30_000);

  test('an unknown spreadsheet ad id stays unresolved with an inline error', async () => {
    const bare: ApiRenderDeliveryTarget = {
      action: 'replace',
      adId: '4040',
      adAccountId: '',
      campaignId: '',
      adsetId: '',
    };
    render(<Harness meta={CONNECTED} rows={[{ ...ROWS[1]!, delivery: bare }]} />);
    expect(
      await screen.findByText('Ad 4040 isn’t a paused or active ad in this account.'),
    ).toBeTruthy();
    expect(metaDeliveryProblems(latest.rows, OUTPUTS, {}, CONNECTED)).toEqual(['Resolve 1 ad ID.']);
  }, 30_000);

  test('no ad account is a clear empty state, and a stale target must be cleared', async () => {
    const replace = replaceTargetFor('act_1', AD_ONE) as ApiRenderDeliveryTarget;
    const notConnected: MetaPickerState = {
      connected: false,
      adAccountId: null,
      adAccountName: null,
    };
    render(<Harness meta={notConnected} rows={[ROWS[0]!, { ...ROWS[1]!, delivery: replace }]} />);

    expect(screen.getByText('No ad account connected')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open integrations' }).getAttribute('href')).toBe(
      '/settings?section=integrations',
    );
    expect(screen.queryByRole('button', { name: /Replace an ad/ })).toBeNull();
    expect(searchPaidMock).not.toHaveBeenCalled();

    expect(screen.getByText(/1 row asks to replace an ad/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear ad targets' }));
    expect(latest.rows.every((row) => !row.delivery)).toBe(true);
    expect(metaDeliveryProblems(latest.rows, OUTPUTS, {}, notConnected)).toEqual([]);
  }, 30_000);
});
