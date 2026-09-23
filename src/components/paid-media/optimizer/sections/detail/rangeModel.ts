// The portfolio dashboard's ONE reporting range now lives in `@continuum/contracts`
// (optimization/range.ts): a saved Jaina dashboard records the window each block was
// computed for in the same vocabulary, and a stored, wire-crossing value has one home.
// Re-exported here so the optimizer's imports stay where they were.

export {
  addDays,
  DEFAULT_RANGE,
  daysBetween,
  type FlightFields,
  isIsoDate,
  lookbackFor,
  parseRangeParam,
  RANGE_PRESET_LABEL,
  RANGE_PRESETS,
  type RangePreset,
  type RangeSpec,
  type ResolvedRange,
  resolveRange,
  serializeRange,
  todayIso,
  windowFor,
} from '@continuum/contracts';
