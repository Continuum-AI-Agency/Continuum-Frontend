// Operator table tests for the rules DSL (bun test).
import { expect, test } from 'bun:test';

import { OPERATORS } from '../src/rules/operators';

test('standard comparison operators', () => {
  expect(OPERATORS.equal(1, 1)).toBe(true);
  expect(OPERATORS.equal('a', 'b')).toBe(false);
  expect(OPERATORS.notEqual('positive', 'negative')).toBe(true);
  expect(OPERATORS.greaterThan(2, 1)).toBe(true);
  expect(OPERATORS.greaterThan(1, 2)).toBe(false);
  expect(OPERATORS.greaterThanInclusive(2, 2)).toBe(true);
  expect(OPERATORS.lessThan(1, 2)).toBe(true);
  expect(OPERATORS.lessThanInclusive(2, 2)).toBe(true);
  expect(OPERATORS.in('retargeting', ['retargeting', 'remarketing'])).toBe(true);
  expect(OPERATORS.notIn('prospecting', ['retargeting', 'remarketing'])).toBe(true);
});

test('numeric operators reject non-numeric operands instead of coercing', () => {
  expect(OPERATORS.greaterThan('5' as never, 1)).toBe(false);
  expect(OPERATORS.greaterThan(5, undefined)).toBe(false);
  expect(OPERATORS.lessThan(undefined, 5)).toBe(false);
  expect(OPERATORS.greaterThan(Number.NaN, 1)).toBe(false);
});

test('isGreaterThanPercentOf / isLessThanPercentOf — DCO semantics', () => {
  // spend 850 > 80% of budget 1000 (= 800)
  expect(OPERATORS.isGreaterThanPercentOf(850, { baseValue: 1000, percentage: 80 })).toBe(true);
  expect(OPERATORS.isGreaterThanPercentOf(750, { baseValue: 1000, percentage: 80 })).toBe(false);
  // roas 1.3 < 70% of 2.0 (= 1.4)
  expect(OPERATORS.isLessThanPercentOf(1.3, { baseValue: 2.0, percentage: 70 })).toBe(true);
  expect(OPERATORS.isLessThanPercentOf(1.5, { baseValue: 2.0, percentage: 70 })).toBe(false);
  // zero/missing base => false, never a throw (the DCO's data-presence guard)
  expect(OPERATORS.isGreaterThanPercentOf(850, { baseValue: 0, percentage: 80 })).toBe(false);
  expect(OPERATORS.isLessThanPercentOf(1.3, { percentage: 70 })).toBe(false);
});

test('isGreaterThanRatio / isLessThanRatio — DCO semantics', () => {
  // cpc 2.3 > adset avg 1.5 × 1.5 (= 2.25)
  expect(OPERATORS.isGreaterThanRatio(2.3, { compareValue: 1.5, ratio: 1.5 })).toBe(true);
  expect(OPERATORS.isGreaterThanRatio(2.2, { compareValue: 1.5, ratio: 1.5 })).toBe(false);
  // roas 1.3 < account avg 2.0 × 0.7 (= 1.4)
  expect(OPERATORS.isLessThanRatio(1.3, { compareValue: 2.0, ratio: 0.7 })).toBe(true);
  expect(OPERATORS.isLessThanRatio(1.5, { compareValue: 2.0, ratio: 0.7 })).toBe(false);
  // zero compare base => false (doubles as the "reference has data" gate)
  expect(OPERATORS.isGreaterThanRatio(100, { compareValue: 0, ratio: 2.5 })).toBe(false);
  expect(OPERATORS.isLessThanRatio(0.1, { compareValue: 0, ratio: 0.7 })).toBe(false);
  // Infinity fact value beats any finite threshold (the P1 ATC-cost proxy)
  expect(
    OPERATORS.isGreaterThanRatio(Number.POSITIVE_INFINITY, { compareValue: 10, ratio: 4 }),
  ).toBe(true);
});

test('isWithinPercentRange — DCO semantics', () => {
  expect(
    OPERATORS.isWithinPercentRange(2.0, { baseValue: 2.0, minPercent: 80, maxPercent: 120 }),
  ).toBe(true);
  expect(
    OPERATORS.isWithinPercentRange(1.6, { baseValue: 2.0, minPercent: 80, maxPercent: 120 }),
  ).toBe(true);
  expect(
    OPERATORS.isWithinPercentRange(2.5, { baseValue: 2.0, minPercent: 80, maxPercent: 120 }),
  ).toBe(false);
  expect(
    OPERATORS.isWithinPercentRange(2.0, { baseValue: 0, minPercent: 80, maxPercent: 120 }),
  ).toBe(false);
});
