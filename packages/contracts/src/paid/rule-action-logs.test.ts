import { describe, expect, it } from 'bun:test';
import { parseRuleActionLogResponse } from './rule-action-logs';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'log-1',
  brandId: 'brand-1',
  metaAccountId: 'act_1',
  metaCampaignId: '120',
  metaAdsetId: null,
  metaAdId: null,
  actionType: 'PAUSE_CAMPAIGN',
  status: 'EXECUTED',
  scopeType: 'CAMPAIGN',
  scopeId: '120',
  occurredAt: '2026-10-09T10:00:00Z',
  actionPayload: { reason: 'cpa over target' },
  paramsChanged: {},
  result: {},
  decisionNote: null,
  error: null,
  ...over,
});

const pagination = {
  page: 1,
  pageSize: 20,
  totalCount: 2,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

describe('parseRuleActionLogResponse', () => {
  it('reads a well-formed response', () => {
    const parsed = parseRuleActionLogResponse({ data: [row(), row({ id: 'log-2' })], pagination });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.read.logs.map((log) => log.id)).toEqual(['log-1', 'log-2']);
    expect(parsed.read.pagination?.totalCount).toBe(2);
    expect(parsed.read.dropped).toEqual([]);
  });

  it('drops the row that lost a key (the failure lane deletes the first non-null key of each row) and keeps the rest', () => {
    const maimed = row();
    delete (maimed as { id?: string }).id;
    const parsed = parseRuleActionLogResponse({ data: [maimed, row({ id: 'log-2' })], pagination });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.read.logs.map((log) => log.id)).toEqual(['log-2']);
    expect(parsed.read.dropped).toEqual([{ index: 0, issue: expect.stringContaining('id') }]);
  });

  it('refuses an envelope without rows, naming what is missing', () => {
    const parsed = parseRuleActionLogResponse({ pagination });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issue).toContain('data');
    expect(parseRuleActionLogResponse('<!DOCTYPE html>').ok).toBe(false);
    expect(parseRuleActionLogResponse(null).ok).toBe(false);
  });

  it('tolerates null json columns and an unknown vocabulary costs only that row', () => {
    const parsed = parseRuleActionLogResponse({
      data: [
        row({ actionPayload: null, paramsChanged: null, result: null }),
        row({ id: 'log-x', status: 'SOMETHING_NEW' }),
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.read.logs).toHaveLength(1);
    expect(parsed.read.logs[0]?.actionPayload).toEqual({});
    expect(parsed.read.pagination).toBeNull();
    expect(parsed.read.dropped[0]?.issue).toContain('status');
  });
});
