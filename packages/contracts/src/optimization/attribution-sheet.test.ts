import { describe, expect, it } from 'bun:test';
import {
  SheetAttributionConfigSchema,
  type SheetSyncReport,
  SheetSyncReportSchema,
  sheetMatchLevel,
} from './attribution-sheet';

const config = {
  source: 'google_sheet',
  spreadsheetId: '1AbCdEf',
  headerRow: 1,
  columns: { date: 'Fecha', matchKey: 'Conjunto', conversions: 'Leads' },
  matchKeyKind: 'adset_name',
  dateFormat: 'iso',
  timezone: 'America/Mexico_City',
} as const;

function report(over: Partial<SheetSyncReport> = {}): SheetSyncReport {
  return {
    rowsRead: 4,
    rowsMatched: 2,
    rowsUnmatched: 1,
    rowsInvalid: 1,
    matchedBy: { id: 1, name: 1, utm: 0 },
    coverage: {
      ratio: 0.9,
      covered: 9,
      spending: 10,
      window: { since: '2026-09-24', until: '2026-09-30' },
    },
    used: 'spreadsheet',
    fallbackReason: 'none',
    replaced: { since: '2026-09-24', until: '2026-09-30' },
    unmatchedSamples: [{ row: 4, key: 'NO EXISTE', platform: null }],
    errors: [{ row: 5, column: 'Leads', code: 'bad_conversions', message: 'not a number: "x"' }],
    ...over,
  };
}

describe('SheetAttributionConfigSchema', () => {
  it('accepts a Google Sheet mapped by header names', () => {
    expect(SheetAttributionConfigSchema.parse(config).headerRow).toBe(1);
  });

  it('defaults the header row to 1 and accepts column indexes for a CSV upload', () => {
    const parsed = SheetAttributionConfigSchema.parse({
      ...config,
      source: 'csv_upload',
      spreadsheetId: undefined,
      headerRow: undefined,
      columns: { date: 0, matchKey: 2, conversions: 3, value: 4, platform: 1 },
    });
    expect(parsed.headerRow).toBe(1);
    expect(parsed.columns.platform).toBe(1);
  });

  it('refuses a Google Sheet without its id', () => {
    const parsed = SheetAttributionConfigSchema.safeParse({ ...config, spreadsheetId: undefined });
    expect(parsed.success).toBe(false);
  });

  it('refuses a time zone that is not IANA', () => {
    expect(SheetAttributionConfigSchema.safeParse({ ...config, timezone: 'Mexico' }).success).toBe(
      false,
    );
  });

  it('refuses an unknown key kind and a header row of 0', () => {
    expect(
      SheetAttributionConfigSchema.safeParse({ ...config, matchKeyKind: 'ad_name' }).success,
    ).toBe(false);
    expect(SheetAttributionConfigSchema.safeParse({ ...config, headerRow: 0 }).success).toBe(false);
  });
});

describe('sheetMatchLevel', () => {
  it('puts ad set keys and utm_content on the group, the rest on the campaign', () => {
    expect(sheetMatchLevel('adset_id')).toBe('group');
    expect(sheetMatchLevel('adset_name')).toBe('group');
    expect(sheetMatchLevel('utm_content')).toBe('group');
    expect(sheetMatchLevel('campaign_id')).toBe('campaign');
    expect(sheetMatchLevel('campaign_name')).toBe('campaign');
    expect(sheetMatchLevel('utm_campaign')).toBe('campaign');
  });
});

describe('SheetSyncReportSchema', () => {
  it('accepts a report whose rows all add up', () => {
    expect(SheetSyncReportSchema.safeParse(report()).success).toBe(true);
  });

  it('refuses a report that lost a row', () => {
    expect(SheetSyncReportSchema.safeParse(report({ rowsRead: 5 })).success).toBe(false);
  });

  it('refuses matchedBy that does not add up to rowsMatched', () => {
    expect(
      SheetSyncReportSchema.safeParse(report({ matchedBy: { id: 2, name: 1, utm: 0 } })).success,
    ).toBe(false);
  });

  it('refuses a fallback without a reason and a used sheet with one', () => {
    expect(SheetSyncReportSchema.safeParse(report({ used: 'platform' })).success).toBe(false);
    expect(SheetSyncReportSchema.safeParse(report({ fallbackReason: 'coverage' })).success).toBe(
      false,
    );
    expect(
      SheetSyncReportSchema.safeParse(report({ used: 'platform', fallbackReason: 'coverage' }))
        .success,
    ).toBe(true);
  });
});
