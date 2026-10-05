import { describe, expect, it } from 'bun:test';
import { type SheetAttributionConfig, SheetAttributionConfigSchema } from '@continuum/contracts';
import {
  buildSheetConfig,
  draftFromSuggestion,
  formatReadAge,
  spreadsheetIdFrom,
} from './attributionModel';
import {
  checkSheet,
  inspectSheet,
  type SheetAttributionClient,
  saveSheetSource,
  syncSheet,
} from './sheetAttributionApi';
import { readPickerMessage } from './useGoogleSheetPicker';

const PORTFOLIO = '0b8f0c55-1d2e-4c3b-8a9f-6e5d4c3b2a10';
const CONFIG: SheetAttributionConfig = SheetAttributionConfigSchema.parse({
  source: 'csv_upload',
  columns: { date: 0, matchKey: 1, conversions: 2 },
  matchKeyKind: 'campaign_id',
  dateFormat: 'iso',
  timezone: 'America/Mexico_City',
});

function client(answer: { data?: unknown; error?: unknown }) {
  const calls: { kind: 'rpc' | 'edge'; name: string; args: unknown }[] = [];
  const fake: SheetAttributionClient = {
    rpc: async (name, args) => {
      calls.push({ kind: 'rpc', name, args });
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
    functions: {
      invoke: async (name, options) => {
        calls.push({ kind: 'edge', name, args: options?.body });
        return { data: answer.data ?? null, error: answer.error ?? null };
      },
    },
  };
  return { fake, calls };
}

describe('saveSheetSource', () => {
  it('calls optimizer_upsert_sheet_attribution_source and activates the sheet', async () => {
    const { fake, calls } = client({ data: '7a1c6f0e-3b0f-4a55-9b1e-2a5f3b9e0c11' });
    const outcome = await saveSheetSource(PORTFOLIO, CONFIG, 'CRM leads', fake);
    expect(outcome).toEqual({
      status: 'ready',
      data: { sourceId: '7a1c6f0e-3b0f-4a55-9b1e-2a5f3b9e0c11' },
    });
    expect(calls).toEqual([
      {
        kind: 'rpc',
        name: 'optimizer_upsert_sheet_attribution_source',
        args: {
          p_portfolio_id: PORTFOLIO,
          p_config: CONFIG,
          p_label: 'CRM leads',
          p_activate: true,
        },
      },
    ]);
  });

  it('is unavailable when the RPC is missing or reserved for the service', async () => {
    for (const code of ['PGRST202', '42883', '42501']) {
      const { fake } = client({ error: { code, message: 'nope' } });
      expect(await saveSheetSource(PORTFOLIO, CONFIG, null, fake)).toEqual({
        status: 'unavailable',
      });
    }
  });

  it('carries any other error message through', async () => {
    const { fake } = client({ error: { code: '22023', message: 'a sheet source needs columns' } });
    expect(await saveSheetSource(PORTFOLIO, CONFIG, null, fake)).toEqual({
      status: 'error',
      message: 'a sheet source needs columns',
    });
  });
});

describe('the sheet edge calls', () => {
  it('sends inspect, check and sync to optimizer-attribution-sheet with their action', async () => {
    const { fake, calls } = client({ data: {} });
    await inspectSheet(PORTFOLIO, { source: 'csv_upload', csv: 'a,b\n1,2' }, fake);
    await checkSheet(PORTFOLIO, CONFIG, 'a,b\n1,2', fake);
    await syncSheet(PORTFOLIO, null, fake);
    expect(calls.map((call) => call.name)).toEqual([
      'optimizer-attribution-sheet',
      'optimizer-attribution-sheet',
      'optimizer-attribution-sheet',
    ]);
    expect(calls.map((call) => (call.args as { action: string }).action)).toEqual([
      'inspect',
      'check',
      'sync',
    ]);
    expect(calls[2]?.args).toEqual({ action: 'sync', portfolioId: PORTFOLIO });
  });

  it('is unavailable on 404/501, an error on a malformed answer', async () => {
    for (const status of [404, 501]) {
      const { fake } = client({ error: { context: { status } } });
      expect(await syncSheet(PORTFOLIO, null, fake)).toEqual({ status: 'unavailable' });
    }
    const { fake } = client({ data: { rowsRead: 'many' } });
    expect((await syncSheet(PORTFOLIO, null, fake)).status).toBe('error');
  });
});

describe('attributionModel', () => {
  it('reads a sheet id from a URL or a bare id, and nothing else', () => {
    expect(
      spreadsheetIdFrom('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp_-x/edit#gid=0'),
    ).toBe('1AbCdEfGhIjKlMnOp_-x');
    expect(spreadsheetIdFrom('1AbCdEfGhIjKlMnOpQrStUvWx')).toBe('1AbCdEfGhIjKlMnOpQrStUvWx');
    expect(spreadsheetIdFrom('https://example.com/x')).toBeNull();
  });

  it('formats a read age in minutes, hours and days', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    expect(formatReadAge('2026-09-28T11:59:40Z', now)).toBe('just now');
    expect(formatReadAge('2026-09-28T11:48:00Z', now)).toBe('12 min ago');
    expect(formatReadAge('2026-09-28T09:00:00Z', now)).toBe('3 h ago');
    expect(formatReadAge('2026-09-25T12:00:00Z', now)).toBe('3 days ago');
    expect(formatReadAge(null, now)).toBeNull();
  });

  it('builds a valid config from a complete draft and names what a partial one lacks', () => {
    const draft = draftFromSuggestion(
      {
        headerRow: 2,
        headers: ['Date', 'Campaign ID', 'Leads'],
        columns: {
          date: { column: 0, header: 'Date', confidence: 1 },
          matchKey: { column: 1, header: 'Campaign ID', confidence: 1 },
          conversions: null,
          value: null,
          platform: null,
        },
        matchKeyKind: 'campaign_id',
        dateFormat: null,
      },
      'UTC',
    );
    const partial = buildSheetConfig({ source: 'csv_upload' }, draft);
    expect(partial).toEqual({ ok: false, missing: ['Conversions', 'Date format'] });
    const complete = buildSheetConfig(
      { source: 'google_sheet', spreadsheetId: 'sheet-1', tab: 'Leads' },
      { ...draft, columns: { ...draft.columns, conversions: 2 }, dateFormat: 'iso' },
    );
    expect(complete).toMatchObject({
      ok: true,
      config: {
        source: 'google_sheet',
        spreadsheetId: 'sheet-1',
        tab: 'Leads',
        headerRow: 2,
        columns: { date: 0, matchKey: 1, conversions: 2 },
      },
    });
  });
});

describe('readPickerMessage', () => {
  const base = { provider: 'google-drive', state: 's1' };

  it('takes a picked Google Sheet and ignores messages that are not ours', () => {
    expect(
      readPickerMessage(
        {
          ...base,
          type: 'documents:linked',
          fileId: 'sheet-1',
          name: 'CRM',
          mimeType: 'application/vnd.google-apps.spreadsheet',
        },
        's1',
      ),
    ).toEqual({ sheet: { spreadsheetId: 'sheet-1', name: 'CRM' } });
    expect(
      readPickerMessage({ ...base, state: 'other', type: 'documents:linked' }, 's1'),
    ).toBeNull();
    expect(readPickerMessage('hello', 's1')).toBeNull();
  });

  it('refuses a file that is not a sheet, and surfaces the picker error', () => {
    expect(
      readPickerMessage(
        { ...base, type: 'documents:linked', fileId: 'doc-1', mimeType: 'application/pdf' },
        's1',
      ),
    ).toEqual({ error: 'That file is not a Google Sheet. Pick a spreadsheet, or upload a CSV.' });
    expect(
      readPickerMessage({ ...base, type: 'documents:error', message: 'closed' }, 's1'),
    ).toEqual({ error: 'closed' });
  });
});
