import { describe, expect, it } from 'bun:test';

import {
  jainaExecutionObjectiveSchema,
  jainaObjectivesEventDataSchema,
  jainaObjectiveUpdatedEventDataSchema,
} from './jaina';

const objective = {
  id: 'objective-1',
  objective_key: 'key-1',
  title: 'Inspect account performance',
  description: null,
  status: 'blocked',
  scope: 'account',
  reason_code: 'awaiting_dependency',
  details: null,
  attempt_count: 1,
  version: 3,
  not_before: null,
  last_attempt_at: '2026-07-29T00:00:01.000Z',
  created_at: '2026-07-29T00:00:00.000Z',
  updated_at: '2026-07-29T00:00:01.000Z',
} as const;

describe('Jaina objective stream contracts', () => {
  it('preserves the complete objective state machine and version', () => {
    expect(jainaExecutionObjectiveSchema.parse(objective)).toMatchObject({
      status: 'blocked',
      version: 3,
      reason_code: 'awaiting_dependency',
    });
  });

  it('validates snapshots and versioned deltas', () => {
    expect(
      jainaObjectivesEventDataSchema.parse({ plan_id: 'plan-1', objectives: [objective] })
        .objectives,
    ).toHaveLength(1);
    expect(
      jainaObjectiveUpdatedEventDataSchema.parse({
        objective: { ...objective, status: 'completed', version: 4 },
        previous_status: 'in_progress',
        transition_id: 'transition-1',
      }),
    ).toMatchObject({
      objective: { status: 'completed', version: 4 },
      previous_status: 'in_progress',
    });
  });
});
