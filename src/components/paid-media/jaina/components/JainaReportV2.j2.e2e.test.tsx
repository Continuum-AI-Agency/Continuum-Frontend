/**
 * The Frontend half of `jaina:report:blocks:e2e:bench`.
 *
 * The Backend bench drives a real strategy question through the real orchestrator against a
 * real ad account and grades the block ARRAY it ships. For its whole life it said, in its
 * own header, "NOT COVERED: the Frontend render itself". This file closes that hop: the
 * bench writes the exact `CheckpointReport` it graded to a JSON file, then runs this test
 * from the Frontend's own cwd (its bunfig preload is what gives happy-dom to the run) with
 * `JAINA_J2_REPORT_PATH` set. The report is parsed through the same `checkpointReportV2Schema`
 * the chat surface parses a live frame with and rendered through the real `JainaReportV2`
 * with the real blocks — no `BlockRenderer` mock, no fixture standing in for the read.
 *
 * What it asserts is the J2 card the reader sees, not the intermediate that implies it:
 * the sentence carries a figure; the tiles carry the prior period and a read word; the
 * narrative is three boxes; the evidence is folded with the first fold open; the follow-ups
 * come last; and the Backend's block order survives the render.
 *
 * Without the env var the suite is skipped BY NAME, so a plain `bun test` run says so
 * rather than reporting a hop it never took.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { type CheckpointReportV2, checkpointReportV2Schema } from '@/lib/jaina/schemas';

const REPORT_PATH = process.env.JAINA_J2_REPORT_PATH?.trim() ?? '';

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children as ReactNode}</button>
  ),
  buttonVariants: () => '',
}));
mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: mock() }),
}));
// Markdown rendering is Streamdown's and is not the hop under test; the words are.
mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content, className }: { content: string; className?: string }) => (
    <p className={className} data-testid="md">
      {content}
    </p>
  ),
}));
mock.module('@/components/ai-elements/suggestion', () => ({
  Suggestions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Suggestion: ({ suggestion }: { suggestion: string }) => (
    <button type="button">{suggestion}</button>
  ),
}));
mock.module('@/lib/api/http', () => ({
  http: { request: mock(async () => ({ ok: true })) },
}));

const { JainaReportV2 } = await import('./JainaReportV2');

afterEach(cleanup);

const follows = (before: Element, after: Element): boolean =>
  (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;

describe.skipIf(REPORT_PATH.length === 0)(
  'jaina:report:blocks:e2e:bench — the Frontend half: the real report renders as a J2 card',
  () => {
    // Read lazily: `describe.skipIf` still runs this callback to collect the tests, so an
    // eager read would fail a plain `bun test` on the missing path.
    const shipped = (): { raw: unknown; report: CheckpointReportV2 } => {
      const raw: unknown = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
      return { raw, report: checkpointReportV2Schema.parse(raw) };
    };
    const gridBlocksOf = (report: CheckpointReportV2) =>
      report.blocks.filter((block) => block.category === 'metric_grid');
    const narrativeBlocksOf = (report: CheckpointReportV2) =>
      report.blocks.filter((block) => block.category === 'narrative');
    const evidenceBlocksOf = (report: CheckpointReportV2) =>
      report.blocks.filter((block) =>
        ['chart', 'data_table', 'comparison', 'goal_pacing'].includes(block.category),
      );

    it('parses the shipped report without degrading a single block', () => {
      const { raw, report } = shipped();
      const sent = (raw as { blocks: Array<{ category: string; block_id: string }> }).blocks;
      expect(report.blocks.map((block) => `${block.category}:${block.block_id}`)).toEqual(
        sent.map((block) => `${block.category}:${block.block_id}`),
      );
    });

    it('opens with the executive sentence, at the answer step, carrying a figure', async () => {
      const { report } = shipped();
      const gridBlocks = gridBlocksOf(report);
      render(<JainaReportV2 report={report} isStreaming={false} />);
      // A sentence with prose marks renders as several runs inside one answer-step root; a
      // plain one as a single run. The container is the sentence either way.
      const sentence = document.querySelector('[data-report-part="sentence"]');
      expect(sentence?.querySelector('.text-xl')).not.toBeNull();
      expect(sentence?.textContent ?? '').toMatch(/\d/u);
      await waitFor(() =>
        expect(screen.queryAllByTestId('metric-grid-block').length).toBe(gridBlocks.length),
      );
    });

    it('draws every metric as a J2 tile: a read word, and the prior period whenever one was read', async () => {
      const { report } = shipped();
      const gridBlocks = gridBlocksOf(report);
      render(<JainaReportV2 report={report} isStreaming={false} />);
      const metrics = gridBlocks.flatMap((block) =>
        block.category === 'metric_grid' ? block.metrics : [],
      );
      expect(metrics.length).toBeGreaterThan(0);
      await waitFor(() => expect(screen.getAllByTestId('metric-read').length).toBe(metrics.length));
      const compared = metrics.filter((metric) => metric.prior_value !== null);
      expect(screen.queryAllByTestId('metric-prior').length).toBe(compared.length);
      for (const read of screen.getAllByTestId('metric-read')) {
        expect(read.textContent?.trim().length ?? 0).toBeGreaterThan(0);
        expect(read.className).toMatch(/text-(?:success|destructive|foreground|muted-foreground)/u);
      }
    });

    it('draws every narrative as three boxes, and the tiles before the reading', async () => {
      const { report } = shipped();
      const narrativeBlocks = narrativeBlocksOf(report);
      render(<JainaReportV2 report={report} isStreaming={false} />);
      expect(narrativeBlocks.length).toBeGreaterThan(0);
      await waitFor(() =>
        expect(screen.getAllByTestId('narrative-three').length).toBe(narrativeBlocks.length),
      );
      const boxes = document.querySelectorAll('[data-narrative-box]');
      expect(boxes.length).toBe(narrativeBlocks.length * 3);
      const grid = screen.getAllByTestId('metric-grid-block')[0];
      const three = screen.getAllByTestId('narrative-three')[0];
      expect(follows(grid, three)).toBe(true);
    });

    it('folds the evidence under the disclosure, first fold open, and keeps the follow-ups last', async () => {
      const { report } = shipped();
      const evidenceBlocks = evidenceBlocksOf(report);
      render(<JainaReportV2 report={report} isStreaming={false} />);
      const folds = Array.from(document.querySelectorAll('[data-evidence-fold]'));
      expect(folds.map((fold) => fold.getAttribute('data-evidence-fold'))).toEqual(
        evidenceBlocks.map((block) => block.block_id),
      );
      if (folds.length > 0) {
        expect(folds.map((fold) => fold.hasAttribute('open'))).toEqual(
          folds.map((_, index) => index === 0),
        );
      }
      const sections = Array.from(document.querySelectorAll('[data-report-section]')).map((node) =>
        node.getAttribute('data-report-section'),
      );
      if (report.follow_up_questions.length > 0) {
        expect(sections[sections.length - 1]).toBe('follow-ups');
      }
      await waitFor(() =>
        expect(document.querySelectorAll('[data-block-heading]').length).toBeGreaterThan(0),
      );
    });

    it('keeps the Backend’s block order: the answer section in report order, the evidence in report order', async () => {
      const { report } = shipped();
      const evidenceBlocks = evidenceBlocksOf(report);
      render(<JainaReportV2 report={report} isStreaming={false} />);
      // Every block draws its own heading (`BlockHeading`) or its scope strip; walk them in DOM
      // order and compare with the array the Backend shipped, split by section.
      await waitFor(() =>
        expect(document.querySelectorAll('[data-block-heading]').length).toBeGreaterThan(0),
      );
      const answer = document.querySelector('[data-report-section="answer"]');
      const evidence = document.querySelector('[data-report-section="justification"]');
      const answerTitles = Array.from(
        answer?.querySelectorAll('[data-block-heading] h4') ?? [],
      ).map((node) => node.textContent?.trim());
      const expectedAnswer = report.blocks
        .filter((block) =>
          ['metric_grid', 'narrative', 'insight_list', 'actions', 'survey'].includes(
            block.category,
          ),
        )
        .map((block) => block.title.trim());
      expect(answerTitles).toEqual(expectedAnswer);
      const foldIds = Array.from(evidence?.querySelectorAll('[data-evidence-fold]') ?? []).map(
        (node) => node.getAttribute('data-evidence-fold'),
      );
      expect(foldIds).toEqual(evidenceBlocks.map((block) => block.block_id));
    });
  },
);
