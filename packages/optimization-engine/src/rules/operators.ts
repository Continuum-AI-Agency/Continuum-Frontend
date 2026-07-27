// ---------------------------------------------------------------------------
// Rule operators. The five proportional operators are the DCO's custom
// json-rules-engine operators (rules.service.js registerCustomOperators),
// ported with identical semantics — including the deliberate guards that
// return false (not throw) when the comparison base is 0 or non-numeric.
// Those guards double as the "reference has data" checks: e.g.
//   isGreaterThanRatio(cpp, { compareValue: robust_best_cpp, ratio: 2.5 })
// is false when robust_best_cpp is 0, reproducing the built-in triggers'
// explicit `robustBestCpp > 0` precondition without an extra condition line.
// ---------------------------------------------------------------------------

import type { FactValue } from './types';

/** Operator parameter objects arrive with FactRefs already resolved to values. */
export type ResolvedValue = FactValue | FactValue[] | Record<string, FactValue> | undefined;

type OperatorFn = (factValue: FactValue | undefined, value: ResolvedValue) => boolean;

const num = (x: unknown): x is number => typeof x === 'number' && !Number.isNaN(x);

const field = (value: ResolvedValue, key: string): FactValue | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, FactValue>)[key]
    : undefined;

export const OPERATORS: Record<string, OperatorFn> = {
  equal: (factValue, value) => factValue === value,

  notEqual: (factValue, value) => factValue !== value,

  greaterThan: (factValue, value) => num(factValue) && num(value) && factValue > value,

  greaterThanInclusive: (factValue, value) => num(factValue) && num(value) && factValue >= value,

  lessThan: (factValue, value) => num(factValue) && num(value) && factValue < value,

  lessThanInclusive: (factValue, value) => num(factValue) && num(value) && factValue <= value,

  in: (factValue, value) =>
    Array.isArray(value) && factValue !== undefined && value.includes(factValue),

  notIn: (factValue, value) =>
    Array.isArray(value) && (factValue === undefined || !value.includes(factValue)),

  // --- DCO proportional operators (verbatim semantics) ---------------------

  /** factValue > baseValue * percentage / 100. False when baseValue is 0/non-num. */
  isGreaterThanPercentOf: (factValue, value) => {
    const baseValue = field(value, 'baseValue');
    const percentage = field(value, 'percentage');
    if (!num(baseValue) || baseValue === 0) return false;
    if (!num(percentage)) return false;
    if (!num(factValue)) return false;
    return factValue > (baseValue * percentage) / 100;
  },

  /** factValue < baseValue * percentage / 100. False when baseValue is 0/non-num. */
  isLessThanPercentOf: (factValue, value) => {
    const baseValue = field(value, 'baseValue');
    const percentage = field(value, 'percentage');
    if (!num(baseValue) || baseValue === 0) return false;
    if (!num(percentage)) return false;
    if (!num(factValue)) return false;
    return factValue < (baseValue * percentage) / 100;
  },

  /** factValue > compareValue * ratio. False when compareValue is 0/non-num. */
  isGreaterThanRatio: (factValue, value) => {
    const compareValue = field(value, 'compareValue');
    const ratio = field(value, 'ratio');
    if (!num(compareValue) || compareValue === 0) return false;
    if (!num(ratio)) return false;
    if (!num(factValue)) return false;
    return factValue > compareValue * ratio;
  },

  /** factValue < compareValue * ratio. False when compareValue is 0/non-num. */
  isLessThanRatio: (factValue, value) => {
    const compareValue = field(value, 'compareValue');
    const ratio = field(value, 'ratio');
    if (!num(compareValue) || compareValue === 0) return false;
    if (!num(ratio)) return false;
    if (!num(factValue)) return false;
    return factValue < compareValue * ratio;
  },

  /** minPercent% of base <= factValue <= maxPercent% of base. */
  isWithinPercentRange: (factValue, value) => {
    const baseValue = field(value, 'baseValue');
    const minPercent = field(value, 'minPercent');
    const maxPercent = field(value, 'maxPercent');
    if (!num(baseValue) || baseValue === 0) return false;
    if (!num(minPercent) || !num(maxPercent)) return false;
    if (!num(factValue)) return false;
    const lo = (baseValue * minPercent) / 100;
    const hi = (baseValue * maxPercent) / 100;
    return factValue >= lo && factValue <= hi;
  },
};
