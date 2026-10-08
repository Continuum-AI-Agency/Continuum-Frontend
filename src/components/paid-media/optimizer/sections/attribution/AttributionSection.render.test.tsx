import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  type SheetAttributionConfig,
  type SheetInspectResponse,
  SheetInspectResponseSchema,
  type SheetSyncReport,
  SheetSyncReportSchema,
} from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FIXTURE_NOW, portfolioMetricsFixture } from './__fixtures__/portfolioMetricsFixture';
import { AttributionSectionView } from './AttributionSection';
import type { SheetAttributionApi, SheetCallOutcome } from './sheetAttributionApi';

afterEach(cleanup);

const PORTFOLIO = '0b8f0c55-1d2e-4c3b-8a9f-6e5d4c3b2a10';
const SHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

const INSPECT: SheetInspectResponse = SheetInspectResponseSchema.parse({
  tabs: ['Leads', 'Notes'],
  tab: 'Leads',
  suggestion: {
    headerRow: 1,
    headers: ['Fecha', 'Ad set', 'Leads', 'Fuente'],
    columns: {
      date: { column: 0, header: 'Fecha', confidence: 0.9 },
      matchKey: { column: 1, header: 'Ad set', confidence: 0.8 },
      conversions: { column: 2, header: 'Leads', confidence: 0.9 },
      value: null,
      platform: { column: 3, header: 'Fuente', confidence: 0.6 },
    },
    matchKeyKind: 'adset_name',
    dateFormat: 'dmy',
  },
  preview: [
    ['21/09/2026', 'ITESO // AGOSTO - RTG', '4', 'facebook'],
    ['21/09/2026', 'Search · Leads MX', '17', 'google'],
    ['22/09/2026', 'ITESO // AGOSTO - RTG', '3', 'facebook'],
    ['22/09/2026', 'Leads MX TikTok', '2', 'tiktok'],
    ['23/09/2026', 'Search · Leads MX', '19', 'google'],
  ],
});

function report(covered: number, spending: number): SheetSyncReport {
  const ratio = covered / spending;
  return SheetSyncReportSchema.parse({
    rowsRead: 42,
    rowsMatched: 38,
    rowsUnmatched: 4,
    rowsInvalid: 0,
    matchedBy: { id: 0, name: 38, utm: 0 },
    coverage: { ratio, covered, spending, window: { since: '2026-09-21', until: '2026-09-27' } },
    used: ratio >= 0.8 ? 'spreadsheet' : 'platform',
    fallbackReason: ratio >= 0.8 ? 'none' : 'coverage',
    replaced: null,
    unmatchedSamples: [
      { row: 7, key: 'ALEIRA // AGOSTO - LKL', platform: 'meta' },
      { row: 19, key: 'Brand (old)', platform: null },
    ],
    errors: [],
  });
}

function fakeApi(overrides: Partial<SheetAttributionApi> = {}) {
  const calls = {
    inspect: [] as unknown[],
    check: [] as SheetAttributionConfig[],
    save: [] as unknown[],
    sync: 0,
  };
  const api: SheetAttributionApi = {
    inspect: async (portfolioId, location) => {
      calls.inspect.push({ portfolioId, location });
      return { status: 'ready', data: INSPECT };
    },
    check: async (_portfolioId, config) => {
      calls.check.push(config);
      return { status: 'ready', data: report(9, 10) };
    },
    sync: async () => {
      calls.sync += 1;
      return { status: 'ready', data: report(9, 10) };
    },
    save: async (portfolioId, config, label) => {
      calls.save.push({ portfolioId, config, label });
      return { status: 'ready', data: { sourceId: '7a1c6f0e-3b0f-4a55-9b1e-2a5f3b9e0c11' } };
    },
    ...overrides,
  };
  return { api, calls };
}

function renderSection(
  api: SheetAttributionApi,
  state: Parameters<typeof AttributionSectionView>[0]['metricsState'] = {
    status: 'ready',
    metrics: portfolioMetricsFixture(),
  },
  onSourceChanged = () => {},
  nonMetaMember = false,
) {
  return render(
    <AttributionSectionView
      api={api}
      brandId="b1"
      metricsState={state}
      nonMetaMember={nonMetaMember}
      now={FIXTURE_NOW}
      onSourceChanged={onSourceChanged}
      portfolioId={PORTFOLIO}
    />,
  );
}

async function connectByLink() {
  fireEvent.click(screen.getByRole('button', { name: 'Connect a sheet' }));
  fireEvent.change(screen.getByLabelText('Google Sheet link'), {
    target: { value: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0` },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read' }));
  await screen.findByTestId('sheet-preview');
}

describe('Attribution — source cards', () => {
  it('shows each platform’s own (default, in use), GA4 and Spreadsheet', () => {
    renderSection(fakeApi().api);
    const cards = screen.getAllByTestId('attribution-card');
    expect(cards.map((card) => card.dataset.kind)).toEqual(['platform', 'ga4', 'spreadsheet']);
    expect(cards[0]?.textContent).toContain("Each platform's own");
    expect(cards[0]?.textContent).toContain('default');
    expect(cards[0]?.dataset.inUse).toBe('true');
    expect(screen.getByTestId('ga4-unavailable').textContent).toContain("isn't available yet");
    expect(within(cards[2] as HTMLElement).getByText('Not set up.')).toBeDefined();
  });

  it('says why a configured sheet is not in use, with the 80% bar in plain words', () => {
    renderSection(fakeApi().api, {
      status: 'ready',
      metrics: portfolioMetricsFixture({
        used: 'platform',
        configured: 'spreadsheet',
        fallback: 'coverage',
      }),
    });
    expect(screen.getByTestId('sheet-fallback').textContent).toContain('at least 80%');
    expect(screen.getByTestId('sheet-status').textContent).toContain('Last read 3 h ago');
  });

  it('re-reads the saved sheet now and shows what it matched', async () => {
    const { api, calls } = fakeApi();
    const changed = mock(() => {});
    renderSection(
      api,
      { status: 'ready', metrics: portfolioMetricsFixture({ used: 'spreadsheet' }) },
      changed,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Re-read now' }));
    const result = await screen.findByTestId('sheet-resync-result');
    expect(result.textContent).toContain('38 of 42 rows matched');
    expect(calls.sync).toBe(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('says re-reading is not available yet when the edge is not deployed', async () => {
    const { api } = fakeApi({ sync: async () => ({ status: 'unavailable' }) });
    renderSection(api, {
      status: 'ready',
      metrics: portfolioMetricsFixture({ used: 'spreadsheet' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Re-read now' }));
    expect((await screen.findByTestId('sheet-resync-unavailable')).textContent).toContain(
      "isn't available yet",
    );
  });

  it('keeps the cards and says not available yet when the metrics RPC is missing on a portfolio off Meta', () => {
    renderSection(fakeApi().api, { status: 'unavailable' }, () => {}, true);
    expect(screen.getByTestId('multiplatform-unavailable')).toBeDefined();
    expect(screen.getAllByTestId('attribution-card')).toHaveLength(3);
  });

  it('keeps a Meta-only portfolio as before the multi-platform read: the cards, and no note', () => {
    renderSection(fakeApi().api, { status: 'unavailable' });
    expect(screen.queryByTestId('multiplatform-unavailable')).toBeNull();
    expect(screen.getAllByTestId('attribution-card')).toHaveLength(3);
  });
});

describe('Attribution — spreadsheet flow', () => {
  it('reads a pasted Google Sheet link, previews five rows and prefills every role', async () => {
    const { api, calls } = fakeApi();
    renderSection(api);
    await connectByLink();
    expect(calls.inspect[0]).toEqual({
      portfolioId: PORTFOLIO,
      location: { source: 'google_sheet', spreadsheetId: SHEET_ID },
    });
    const preview = screen.getByTestId('sheet-preview');
    expect(within(preview).getAllByRole('row')).toHaveLength(6);
    expect((screen.getByLabelText('Ad set or campaign') as HTMLSelectElement).value).toBe('1');
    expect((screen.getByLabelText('Conversions') as HTMLSelectElement).value).toBe('2');
    expect((screen.getByLabelText('Date') as HTMLSelectElement).value).toBe('0');
    expect((screen.getByLabelText('Value (optional)') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Platform (optional)') as HTMLSelectElement).value).toBe('3');
    expect((screen.getByLabelText('That column holds') as HTMLSelectElement).value).toBe(
      'adset_name',
    );
    expect((screen.getByLabelText('Date format') as HTMLSelectElement).value).toBe('dmy');
  });

  it('runs the live match check, lists unmatched rows, and saves once checked', async () => {
    const { api, calls } = fakeApi();
    const changed = mock(() => {});
    renderSection(api, undefined, changed);
    await connectByLink();
    const line = await screen.findByTestId('sheet-match-line');
    expect(line.textContent).toBe(
      '38 of 42 rows matched · 9 of 10 ad sets with spend covered (90%)',
    );
    expect(screen.getByTestId('sheet-coverage-bar').textContent).toContain('Above the 80% bar');
    const unmatched = screen.getByTestId('sheet-unmatched');
    expect(unmatched.textContent).toContain('Row 7 · ALEIRA // AGOSTO - LKL · Meta');
    expect(unmatched.textContent).toContain('Row 19 · Brand (old)');
    expect(calls.check[0]).toMatchObject({
      source: 'google_sheet',
      spreadsheetId: SHEET_ID,
      tab: 'Leads',
      columns: { date: 0, matchKey: 1, conversions: 2, platform: 3 },
      matchKeyKind: 'adset_name',
      dateFormat: 'dmy',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use this sheet' }));
    await waitFor(() => expect(calls.save).toHaveLength(1));
    expect(calls.save[0]).toMatchObject({ portfolioId: PORTFOLIO, label: 'Google Sheet' });
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  });

  it('re-checks when a role changes, and explains the bar when coverage is under 80%', async () => {
    let call = 0;
    const { api, calls } = fakeApi({
      check: async (_id, config) => {
        call += 1;
        calls.check.push(config);
        return { status: 'ready', data: call === 1 ? report(9, 10) : report(6, 10) };
      },
    });
    renderSection(api);
    await connectByLink();
    await screen.findByTestId('sheet-match-line');
    fireEvent.change(screen.getByLabelText('That column holds'), {
      target: { value: 'campaign_name' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('sheet-match-line').textContent).toBe(
        '38 of 42 rows matched · 6 of 10 campaigns with spend covered (60%)',
      ),
    );
    expect(screen.getByTestId('sheet-coverage-bar').textContent).toContain('Below the 80% bar');
    expect(calls.check[1]?.matchKeyKind).toBe('campaign_name');
  });

  it('names what is still to pick and does not check an incomplete mapping', async () => {
    const { api, calls } = fakeApi();
    renderSection(api);
    await connectByLink();
    await screen.findByTestId('sheet-match-line');
    fireEvent.change(screen.getByLabelText('Conversions'), { target: { value: '' } });
    expect(screen.getByTestId('sheet-missing').textContent).toBe('Still to pick: Conversions.');
    expect(calls.check).toHaveLength(1);
    expect(
      (screen.getByRole('button', { name: 'Use this sheet' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('re-reads the sheet when another tab is picked', async () => {
    const { api, calls } = fakeApi();
    renderSection(api);
    await connectByLink();
    fireEvent.change(screen.getByLabelText('Tab'), { target: { value: 'Notes' } });
    await waitFor(() => expect(calls.inspect).toHaveLength(2));
    expect(calls.inspect[1]).toEqual({
      portfolioId: PORTFOLIO,
      location: { source: 'google_sheet', spreadsheetId: SHEET_ID, tab: 'Notes' },
    });
  });

  it('reads an uploaded CSV through the same mapping step', async () => {
    const { api, calls } = fakeApi();
    renderSection(api);
    fireEvent.click(screen.getByRole('button', { name: 'Connect a sheet' }));
    const file = new File(['Fecha,Ad set,Leads\n21/09/2026,ITESO,4\n'], 'leads.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });
    await screen.findByTestId('sheet-preview');
    expect(calls.inspect[0]).toEqual({
      portfolioId: PORTFOLIO,
      location: { source: 'csv_upload', csv: 'Fecha,Ad set,Leads\n21/09/2026,ITESO,4\n' },
    });
    await screen.findByTestId('sheet-match-line');
    expect(calls.check[0]?.source).toBe('csv_upload');
  });

  it('refuses a link that is not a Google Sheet', () => {
    renderSection(fakeApi().api);
    fireEvent.click(screen.getByRole('button', { name: 'Connect a sheet' }));
    fireEvent.change(screen.getByLabelText('Google Sheet link'), {
      target: { value: 'https://example.com/report' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(screen.getByRole('alert').textContent).toBe('That is not a Google Sheets link.');
  });

  it('says reading spreadsheets is not available yet when the edge is not deployed', async () => {
    const unavailable = async (): Promise<SheetCallOutcome<SheetInspectResponse>> => ({
      status: 'unavailable',
    });
    renderSection(fakeApi({ inspect: unavailable }).api);
    fireEvent.click(screen.getByRole('button', { name: 'Connect a sheet' }));
    fireEvent.change(screen.getByLabelText('Google Sheet link'), {
      target: { value: SHEET_ID },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect((await screen.findByTestId('sheet-unavailable')).textContent).toContain(
      "isn't available yet",
    );
  });

  it('says saving is not available yet when only the service may call the save RPC', async () => {
    const { api } = fakeApi({ save: async () => ({ status: 'unavailable' }) });
    renderSection(api);
    await connectByLink();
    await screen.findByTestId('sheet-match-line');
    fireEvent.click(screen.getByRole('button', { name: 'Use this sheet' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      "Saving a spreadsheet source isn't available yet.",
    );
  });
});
