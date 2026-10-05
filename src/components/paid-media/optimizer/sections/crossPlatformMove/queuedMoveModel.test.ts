import { describe, expect, test } from 'bun:test';
import { leg, MOVE_ID, moveRec, ref, TIKTOK_TO_META } from './moveFixtures';
import { formatMinorExact, isBudgetMoveRecommendation, readQueuedMove } from './queuedMoveModel';

describe('isBudgetMoveRecommendation', () => {
  test('only the budget_move kind', () => {
    expect(isBudgetMoveRecommendation(moveRec())).toBe(true);
    expect(isBudgetMoveRecommendation(moveRec({ kind: 'pause' }))).toBe(false);
  });
});

describe('readQueuedMove', () => {
  test('one move, every leg, decreases first, the same percentage on each side', () => {
    const move = readQueuedMove(moveRec());
    expect(move).not.toBeNull();
    if (!move) return;
    expect(move.moveId).toBe(MOVE_ID);
    expect(move.currency).toBe('MXN');
    expect(move.amountMinor).toBe(5_925);
    expect(move.from).toEqual(['tiktok_ads']);
    expect(move.to).toEqual(['meta']);
    expect(move.legs.map((l) => l.direction)).toEqual([
      'decrease',
      'decrease',
      'increase',
      'increase',
    ]);
    expect(move.legs.map((l) => l.platform)).toEqual(['tiktok_ads', 'tiktok_ads', 'meta', 'meta']);
    // The side's percentage, not the leg's own rounding: every decrease reads −4.23%.
    expect(move.decreasePct).toBeCloseTo(-4.23, 2);
    expect(move.increasePct).toBeCloseTo(25, 0);
    expect(move.legs.filter((l) => l.direction === 'decrease').map((l) => l.pct)).toEqual([
      move.decreasePct,
      move.decreasePct,
    ]);
    expect(move.legs.filter((l) => l.direction === 'increase').map((l) => l.pct)).toEqual([
      move.increasePct,
      move.increasePct,
    ]);
  });

  test('names the entity when the ref carries one, and the raw id when it does not', () => {
    const move = readQueuedMove(moveRec());
    expect(move?.legs[0]?.entityName).toBe('EF | Leads | Broad MX');
    expect(move?.legs[3]?.entityName).toBeNull();
    expect(move?.legs[3]?.entityId).toBe('120252366877000999');
    expect(move?.legs[0]?.beforeMinor).toBe(40_000);
    expect(move?.legs[0]?.afterMinor).toBe(38_307);
  });

  test('null when the row is not a move or its action does not parse', () => {
    expect(readQueuedMove(moveRec({ kind: 'pause' }))).toBeNull();
    expect(readQueuedMove(moveRec({ action: undefined }))).toBeNull();
    // Increase before decrease is refused by the contract, so it never reaches the screen.
    const reversed = { ...TIKTOK_TO_META, legs: [...TIKTOK_TO_META.legs].reverse() };
    expect(readQueuedMove(moveRec({ action: reversed }))).toBeNull();
  });

  test('a move that spans two donor platforms lists both, in leg order', () => {
    const action = {
      ...TIKTOK_TO_META,
      legs: [
        leg(ref('google_ads', '22000000001', 'PMax · Branches'), 50_000, 45_000),
        leg(ref('tiktok_ads', '201'), 40_000, 36_000),
        leg(ref('meta', '120252366877000236'), 30_000, 39_000),
      ],
    };
    const move = readQueuedMove(moveRec({ action }));
    expect(move?.from).toEqual(['google_ads', 'tiktok_ads']);
    expect(move?.to).toEqual(['meta']);
    expect(move?.decreasePct).toBeCloseTo(-10, 5);
    expect(move?.increasePct).toBeCloseTo(30, 5);
  });
});

describe('formatMinorExact', () => {
  test('prints every minor digit the currency has', () => {
    expect(formatMinorExact(95_768, 'MXN')).toBe('957.68 MXN');
    expect(formatMinorExact(100_000, 'MXN')).toBe('1,000.00 MXN');
    expect(formatMinorExact(5_341, 'USD')).toBe('$53.41');
    expect(formatMinorExact(5_000, 'JPY')).toBe('5,000 JPY');
    expect(formatMinorExact(12_345, 'KWD')).toBe('12.345 KWD');
  });

  test('an unknown currency prints a bare two-decimal figure, never a dollar sign', () => {
    expect(formatMinorExact(5_341, null)).toBe('53.41');
  });
});
