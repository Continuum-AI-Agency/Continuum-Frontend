import type { CreativeStanding } from './creativeModel';

/** STANDING_LABEL's catalog keys: the standing badge said in the UI language. */
export const STANDING_LABEL_KEYS = {
  winning: 'winning_61ce510',
  losing: 'underperforming_31ef4ef',
  iterate: 'needs_a_new_angle_081f21b',
  early: 'too_early_387c8fa',
} as const satisfies Record<CreativeStanding, string>;
