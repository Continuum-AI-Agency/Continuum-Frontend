import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import {
  type CheckpointBlockV2,
  type CheckpointReportV2,
  checkpointBlockV2Schema,
} from '@/lib/jaina/schemas';
import fixture from './__fixtures__/explained_ranking.block.json';

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children as ReactNode}</button>
  ),
  buttonVariants: () => '',
}));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show: mock() }) }));
mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content, className }: { content: string; className?: string }) => (
    <p className={className}>{content}</p>
  ),
}));
mock.module('@/components/ai-elements/suggestion', () => ({
  Suggestions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Suggestion: ({ suggestion }: { suggestion: string }) => (
    <button type="button">{suggestion}</button>
  ),
}));
mock.module('@/lib/api/http', () => ({ http: { request: mock(async () => ({ ok: true })) } }));
// Every other block is a labelled stub: what is under test is where the template halves land.
mock.module('../blocks/BlockRenderer', () => ({
  BlockRenderer: ({ block }: { block: { block_id: string; title: string } }) => (
    <article data-testid={`module-${block.block_id}`}>{block.title}</article>
  ),
}));

const { JainaReportV2 } = await import('../components/JainaReportV2');
const { JainaReportDocument } = await import('../export/JainaReportDocument');

afterEach(cleanup);

const templateBlock = checkpointBlockV2Schema.parse(fixture);
const scope = checkpointBlockV2Schema.parse({
  block_id: 'scope',
  category: 'data_scope',
  scope: 'account',
  title: 'Scope',
  dates: 'Sep 1 – Sep 25, 2026',
  source: 'api',
});
const table = checkpointBlockV2Schema.parse({
  block_id: 'rows',
  category: 'data_table',
  scope: 'account',
  title: 'Campaigns',
  columns: [{ key: 'entity', label: 'Campaign' }],
  rows: [{ entity: 'SEDE C' }],
});

const report = (blocks: CheckpointBlockV2[]) =>
  ({
    language: 'es',
    executive_summary: '',
    reasoning_trace: '',
    blocks,
    follow_up_questions: [],
    media_map: {},
    handoff_trace: [],
    execution_objectives: [],
    cached_sources: [],
    _meta: {
      schema_version: '2',
      block_count: blocks.length,
      has_charts: false,
      has_media: false,
      primary_scope: 'account',
    },
  }) as unknown as CheckpointReportV2;

const partsIn = (container: HTMLElement, section: 'answer' | 'justification') => {
  const root = container.querySelector(`[data-report-section="${section}"]`);
  return [...(root?.querySelectorAll('[data-template-part], [data-testid^="module-"]') ?? [])].map(
    (node) => node.getAttribute('data-template-part') ?? node.getAttribute('data-testid'),
  );
};

describe('a templated answer in the chat report', () => {
  it('puts the sentence and chart in the answer, the steps first under the justification', () => {
    const blocks = [scope, templateBlock, table];
    const { container } = render(<JainaReportV2 report={report(blocks)} isStreaming={false} />);
    expect(partsIn(container, 'answer')).toEqual(['executive']);
    expect(partsIn(container, 'justification')).toEqual([
      'justification',
      'module-scope',
      'module-rows',
    ]);
  });

  it('adds no empty justification heading when nothing else is there', () => {
    const { container } = render(<JainaReportV2 report={report([table])} isStreaming={false} />);
    expect(partsIn(container, 'justification')).toEqual(['module-rows']);
    expect(container.querySelector('[data-template-part]')).toBeNull();
  });
});

describe('a templated answer in the export document', () => {
  it('prints the same split as the chat', () => {
    const blocks = [scope, templateBlock, table];
    const { container } = render(<JainaReportDocument report={report(blocks)} blocks={blocks} />);
    expect(partsIn(container, 'answer')).toEqual(['executive']);
    expect(partsIn(container, 'justification')).toEqual([
      'justification',
      'module-scope',
      'module-rows',
    ]);
    const rows = [...container.querySelectorAll('details[data-rank]')] as HTMLDetailsElement[];
    expect(rows).toHaveLength(4);
  });
});
