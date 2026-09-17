import { describe, expect, it } from 'bun:test';

import { jainaRunOutcomeV1Schema } from './jaina-outcome';

describe('jainaRunOutcomeV1Schema', () => {
  it('accepts bounded operational facts and rejects raw evidence fields', () => {
    const outcome = {
      version: '1',
      run_id: 'run_1',
      session_id: 'session_1',
      brand_id: 'brand_1',
      terminal_status: 'completed',
      finish_reason: 'stop',
      model_usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      step_count: 1,
      tool_call_count: 1,
      duration_ms: 20,
      timed_out: false,
      aborted: false,
      evidence: {
        status: 'sufficient',
        dataset_ids: ['ds_1'],
        dataset_count: 1,
        provenance_dataset_count: 1,
      },
      report: { schema_valid: true, block_count: 1, category_counts: { data_table: 1 } },
      delivery: {},
      correction_retry: false,
    } as const;

    expect(jainaRunOutcomeV1Schema.parse(outcome).delivery.pdf).toBeNull();
    expect(jainaRunOutcomeV1Schema.safeParse({ ...outcome, raw_tool_output: { secret: true } }).success).toBe(false);
  });
});
