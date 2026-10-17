import { describe, expect, it } from 'bun:test';
import type { CheckpointBlockV2 } from '@/lib/jaina/schemas';
import { partitionReportBlocks, stratumOfBlock } from './JainaJustificationSection';

const table = (answerFormat?: boolean): CheckpointBlockV2 =>
  ({
    block_id: answerFormat ? 'asked-table' : 'evidence-table',
    category: 'data_table',
    scope: 'account',
    title: 'Ad sets',
    priority: 'secondary',
    provenance: null,
    columns: [{ key: 'name', label: 'Ad set' }],
    rows: [{ name: 'CAÑADAS // MENSAJES' }],
    citations: [],
    ...(answerFormat === undefined ? {} : { answer_format: answerFormat }),
  }) as unknown as CheckpointBlockV2;

describe('partitionReportBlocks — the format the question asked for is the answer', () => {
  it('puts the block marked answer_format in the answer, whatever its category', () => {
    const { answer, justification } = partitionReportBlocks([table(true), table()]);
    expect(answer.map((block) => block.block_id)).toEqual(['asked-table']);
    expect(justification.map((block) => block.block_id)).toEqual(['evidence-table']);
  });

  it('sets the asked-for block under the sentence with no stratum label over it', () => {
    expect(stratumOfBlock(table(true))).toBe('answer');
    expect(stratumOfBlock(table())).toBe('why');
  });
});
