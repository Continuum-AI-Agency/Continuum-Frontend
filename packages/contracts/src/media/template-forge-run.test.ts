import { describe, expect, test } from 'bun:test';
import {
  decisionsFor,
  groupMappingNeeds,
  KEEP_AS_DESIGNED,
  suggestedAnswer,
  type TemplateForgeNeed,
} from './template-forge-run';

const need = (
  comp: string,
  stableKey: string,
  label: string,
  options: Array<{ fieldPath: string; score?: number }>,
  kind = 'mapping',
): TemplateForgeNeed => ({
  id: `${comp}:${stableKey}`,
  kind,
  comp,
  slot: { stableKey, type: 'text', label },
  options,
});

describe('mapping needs → questions', () => {
  test('one question per slot across comps; asset needs are not questions', () => {
    const questions = groupMappingNeeds([
      need('wide', 'textsource__12', 'Speaker', [{ fieldPath: 'speaker', score: 1 }]),
      need('tall', 'textsource__40', 'Speaker', [{ fieldPath: 'speaker', score: 1 }]),
      need('wide', 'image__3', 'Photo', [], 'asset'),
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.needs).toHaveLength(2);
  });

  test('a scored, untied top option is the answer; a tie is a real question', () => {
    const clear = groupMappingNeeds([
      need('wide', 'k', 'Speaker', [
        { fieldPath: 'speaker', score: 2 },
        { fieldPath: 'role', score: 1 },
      ]),
    ])[0]!;
    expect(suggestedAnswer(clear)).toBe('speaker');
    const tied = groupMappingNeeds([
      need('wide', 'k', 'Speaker', [
        { fieldPath: 'a', score: 1 },
        { fieldPath: 'b', score: 1 },
      ]),
    ])[0]!;
    expect(suggestedAnswer(tied)).toBeUndefined();
    const nothing = groupMappingNeeds([need('wide', 'k', 'Speaker', [])])[0]!;
    expect(suggestedAnswer(nothing)).toBe(KEEP_AS_DESIGNED);
  });

  test('decisions carry one entry per comp that asked', () => {
    const questions = groupMappingNeeds([
      need('wide', 'textsource__12', 'Speaker', [{ fieldPath: 'speaker', score: 1 }]),
      need('tall', 'textsource__40', 'Speaker', [{ fieldPath: 'speaker', score: 1 }]),
    ]);
    const { mappings } = decisionsFor(questions, { [questions[0]!.key]: 'speaker' });
    expect(mappings).toEqual({
      wide: [{ slotStableKey: 'textsource__12', fieldPath: 'speaker' }],
      tall: [{ slotStableKey: 'textsource__40', fieldPath: 'speaker' }],
    });
    const kept = decisionsFor(questions, { [questions[0]!.key]: KEEP_AS_DESIGNED });
    expect(kept.mappings.wide?.[0]?.action).toBe('leaveStatic');
  });
});
