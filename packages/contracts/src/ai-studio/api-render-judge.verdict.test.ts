import { describe, expect, test } from 'bun:test';
import { judgeVerdictSchema } from './api-render-judge';

describe('a verdict as the forge sends it', () => {
  test('keeps its findings when the payload carries usage the contract does not name', () => {
    const parsed = judgeVerdictSchema.safeParse({
      findings: [
        {
          kind: 'unreadable_text',
          layerHint: 'before price strike-through',
          severity: 'high',
          bbox: [816, 368, 843, 638],
          note: 'covers the text',
        },
      ],
      overall: 'fail',
      confidence: 0.95,
      _usage: { inputTokens: 2436, outputTokens: 80 },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.findings).toHaveLength(1);
    expect((parsed.data as Record<string, unknown>)._usage).toBeUndefined();
  });
});
