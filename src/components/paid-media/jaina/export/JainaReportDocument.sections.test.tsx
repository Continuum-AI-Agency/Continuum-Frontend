import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { CheckpointBlockV2, CheckpointReportV2 } from '@/lib/jaina/schemas';

mock.module('../blocks/BlockRenderer', () => ({
  BlockRenderer: ({ block }: { block: { block_id: string; title: string } }) => (
    <article data-testid={`module-${block.block_id}`}>{block.title}</article>
  ),
}));

const { JainaReportDocument } = await import('./JainaReportDocument');

afterEach(cleanup);

const moduleBlock = (block_id: string, category: string) =>
  ({
    block_id,
    category,
    scope: 'current_account',
    title: block_id,
    priority: 1,
    provenance: null,
  }) as unknown as CheckpointBlockV2;

const report = {
  language: 'en',
  executive_summary: 'Account performance summary',
  reasoning_trace: '',
  blocks: [],
  follow_up_questions: [],
  media_map: {},
  handoff_trace: [],
  execution_objectives: [],
  cached_sources: [],
  _meta: {
    schema_version: '2',
    block_count: 0,
    has_charts: false,
    has_media: false,
    primary_scope: 'current_account',
  },
} as unknown as CheckpointReportV2;

const exportedIdsIn = (section: 'answer' | 'justification') =>
  Array.from(document.querySelectorAll(`[data-report-section="${section}"] [data-block-id]`)).map(
    (node) => node.getAttribute('data-block-id'),
  );

describe('JainaReportDocument — the same sections as the chat', () => {
  it('sets the answer blocks first and the figures under Justification, each in report order', () => {
    render(
      <JainaReportDocument
        report={report}
        blocks={[
          moduleBlock('scope', 'data_scope'),
          moduleBlock('reading', 'insight_list'),
          moduleBlock('kpis', 'metric_grid'),
          moduleBlock('trend', 'chart'),
          moduleBlock('rows', 'data_table'),
          moduleBlock('moves', 'actions'),
        ]}
        generatedAt={new Date('2026-09-25T00:00:00Z')}
      />,
    );
    expect(exportedIdsIn('answer')).toEqual(['reading', 'moves']);
    expect(exportedIdsIn('justification')).toEqual(['scope', 'kpis', 'trend', 'rows']);
    expect(screen.getByRole('region', { name: 'Justification' })).toBeTruthy();
    // renderExportDocument waits for every block to mount by counting `[data-block-id]`.
    expect(document.querySelectorAll('[data-block-id]').length).toBe(6);
  });

  it('carries no Justification heading when no block is evidence', () => {
    render(
      <JainaReportDocument
        report={report}
        blocks={[moduleBlock('reading', 'insight_list')]}
        generatedAt={new Date('2026-09-25T00:00:00Z')}
      />,
    );
    expect(screen.queryByText('Justification')).toBeNull();
    expect(exportedIdsIn('answer')).toEqual(['reading']);
  });
});
