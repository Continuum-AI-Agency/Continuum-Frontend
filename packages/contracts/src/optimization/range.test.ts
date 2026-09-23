import { describe, expect, it } from 'bun:test';
import {
  addDays,
  customRange,
  daysBetween,
  parseRangeParam,
  rangeSpecLabel,
  rangeSpecSchema,
  resolveRange,
  serializeRange,
} from './range';

const TODAY = '2026-09-11';

describe('parseRangeParam / serializeRange', () => {
  it('round-trips presets and custom ranges', () => {
    expect(parseRangeParam('d14')).toEqual({ kind: 'preset', preset: 'd14' });
    expect(parseRangeParam('flight')).toEqual({ kind: 'preset', preset: 'flight' });
    expect(parseRangeParam('2026-08-01_2026-08-14')).toEqual({
      kind: 'custom',
      from: '2026-08-01',
      to: '2026-08-14',
    });
    expect(serializeRange({ kind: 'custom', from: '2026-08-01', to: '2026-08-14' })).toBe(
      '2026-08-01_2026-08-14',
    );
    expect(serializeRange({ kind: 'preset', preset: 'd3' })).toBe('d3');
  });
  it('falls back to the default on garbage instead of throwing', () => {
    expect(parseRangeParam(null)).toEqual({ kind: 'preset', preset: 'd7' });
    expect(parseRangeParam('yesterday')).toEqual({ kind: 'preset', preset: 'd7' });
    expect(parseRangeParam('2026-08-14_2026-08-01')).toEqual({ kind: 'preset', preset: 'd7' });
    expect(parseRangeParam('2026-13-01_2026-13-02')).toEqual({ kind: 'preset', preset: 'd7' });
  });
});

describe('rangeSpecSchema', () => {
  it('accepts the two shapes and rejects a custom range that is not two real dates in order', () => {
    expect(rangeSpecSchema.safeParse({ kind: 'preset', preset: 'd30' }).success).toBe(true);
    expect(
      rangeSpecSchema.safeParse({ kind: 'custom', from: '2026-09-13', to: '2026-09-19' }).success,
    ).toBe(true);
    expect(rangeSpecSchema.safeParse({ kind: 'preset', preset: 'last_30d' }).success).toBe(false);
    expect(rangeSpecSchema.safeParse({ kind: 'custom', from: '', to: '' }).success).toBe(false);
    expect(
      rangeSpecSchema.safeParse({ kind: 'custom', from: '2026-09-19', to: '2026-09-13' }).success,
    ).toBe(false);
    expect(
      rangeSpecSchema.safeParse({ kind: 'custom', from: '2026-02-31', to: '2026-03-01' }).success,
    ).toBe(false);
  });
});

describe('customRange', () => {
  it('turns a since/until pair into a custom range and refuses empty or reversed pairs', () => {
    expect(customRange('2026-08-20', '2026-09-18')).toEqual({
      kind: 'custom',
      from: '2026-08-20',
      to: '2026-09-18',
    });
    expect(customRange('', '')).toBeNull();
    expect(customRange(null, '2026-09-18')).toBeNull();
    expect(customRange('2026-09-18', '2026-08-20')).toBeNull();
  });
});

describe('rangeSpecLabel', () => {
  it('names the window without resolving it', () => {
    expect(rangeSpecLabel({ kind: 'preset', preset: 'd30' })).toBe('Last 30 days');
    expect(rangeSpecLabel({ kind: 'preset', preset: 'flight' })).toBe('Flight');
    expect(rangeSpecLabel({ kind: 'custom', from: '2026-09-13', to: '2026-09-19' })).toBe(
      '2026-09-13 → 2026-09-19',
    );
    expect(rangeSpecLabel({ kind: 'custom', from: '2026-09-13', to: '2026-09-13' })).toBe(
      '2026-09-13',
    );
  });
});

describe('resolveRange', () => {
  it('a trailing preset ends today and carries the equal-length prior window', () => {
    const r = resolveRange({ kind: 'preset', preset: 'd7' }, null, TODAY);
    expect(r.from).toBe('2026-09-05');
    expect(r.to).toBe(TODAY);
    expect(r.days).toBe(7);
    expect(r.previous).toEqual({ from: '2026-08-29', to: '2026-09-04' });
    expect(r.label).toBe('Last 7 days');
    expect(r.lookback).toBe('d7');
    expect(r.window).toBe('d7');
  });
  it('maps day counts onto the read-surface and engine windows', () => {
    expect(resolveRange({ kind: 'preset', preset: 'd3' }, null, TODAY)).toMatchObject({
      lookback: 'd7',
      window: 'd3',
    });
    expect(resolveRange({ kind: 'preset', preset: 'd14' }, null, TODAY)).toMatchObject({
      lookback: 'd14',
      window: 'd14',
    });
    expect(resolveRange({ kind: 'preset', preset: 'd30' }, null, TODAY)).toMatchObject({
      lookback: 'd30',
      window: 'd14',
    });
  });
  it('flight resolves to the period, clipped at today', () => {
    const r = resolveRange(
      { kind: 'preset', preset: 'flight' },
      { period_start: '2026-09-01', period_end: '2026-09-30' },
      TODAY,
    );
    expect(r.from).toBe('2026-09-01');
    expect(r.to).toBe(TODAY);
    expect(r.days).toBe(11);
    expect(r.label).toMatch(/^Flight/);
    expect(r.flightMissing).toBe(false);
  });
  it('a finished flight resolves to its own end, not today', () => {
    const r = resolveRange(
      { kind: 'preset', preset: 'flight' },
      { period_start: '2026-08-01', period_end: '2026-08-31' },
      TODAY,
    );
    expect(r.to).toBe('2026-08-31');
    expect(r.days).toBe(31);
  });
  it('flight without a flight falls back to 7 days and says so', () => {
    const r = resolveRange({ kind: 'preset', preset: 'flight' }, { period_start: null }, TODAY);
    expect(r.flightMissing).toBe(true);
    expect(r.days).toBe(7);
    expect(r.spec).toEqual({ kind: 'preset', preset: 'd7' });
    expect(r.label).toMatch(/no flight set/);
  });
  it('custom ranges are clipped at today', () => {
    const r = resolveRange({ kind: 'custom', from: '2026-09-05', to: '2026-09-20' }, null, TODAY);
    expect(r.to).toBe(TODAY);
    expect(r.days).toBe(7);
  });
});

describe('date helpers', () => {
  it('addDays and daysBetween agree', () => {
    expect(addDays('2026-09-11', -10)).toBe('2026-09-01');
    expect(daysBetween('2026-09-01', '2026-09-11')).toBe(10);
  });
});
