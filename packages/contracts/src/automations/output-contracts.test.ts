import { describe, expect, test } from 'bun:test';
import {
  AUTOMATION_NATIVE_OUTPUT_CONTRACTS,
  automationNativeOutputContractIdSchema,
  automationPlannerDraftPayloadSchema,
} from './output-contracts';

const draftItem = {
  platform: 'instagram' as const,
  scheduledAt: '2026-08-03T14:00:00-07:00',
  format: 'carousel' as const,
  caption: 'Three ways our fit test saves you a return.',
  hashtags: ['#fit', '#sizing'],
  brief: 'Lead on the return-rate proof point, close on the size quiz.',
};

describe('planner.draft@1 native output contract', () => {
  // The enum member existed with no registry entry, so `publishReadiness` read
  // it as a native contract "without an executable schema" and refused to
  // publish any graph that formatted into the planner.
  test('is registered, so a graph targeting it is publishable', () => {
    expect(automationNativeOutputContractIdSchema.parse('planner.draft')).toBe('planner.draft');

    const contract = AUTOMATION_NATIVE_OUTPUT_CONTRACTS['planner.draft'];
    expect(contract.version).toBe(1);
    expect(contract.acceptedBy).toEqual(['action.planner_upsert']);
  });

  test('parses a bounded batch of drafts', () => {
    const parsed = automationPlannerDraftPayloadSchema.parse({ items: [draftItem] });
    expect(parsed.items[0]?.format).toBe('carousel');
  });

  test('requires an absolute, offset-bearing schedule', () => {
    expect(
      automationPlannerDraftPayloadSchema.safeParse({
        items: [{ ...draftItem, scheduledAt: '2026-08-03' }],
      }).success,
    ).toBe(false);
  });

  test('refuses an unbounded batch and an unknown format', () => {
    expect(
      automationPlannerDraftPayloadSchema.safeParse({
        items: Array.from({ length: 51 }, () => draftItem),
      }).success,
    ).toBe(false);
    expect(
      automationPlannerDraftPayloadSchema.safeParse({
        items: [{ ...draftItem, format: 'hyperframe' }],
      }).success,
    ).toBe(false);
  });

  test('refuses an empty batch rather than reporting a no-op success', () => {
    expect(automationPlannerDraftPayloadSchema.safeParse({ items: [] }).success).toBe(false);
  });
});
