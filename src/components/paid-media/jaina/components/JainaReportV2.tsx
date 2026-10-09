'use client';

import {
  BookIcon,
  CodeIcon,
  EyeIcon,
  EyeOffIcon,
  FileDownIcon,
  Share2Icon,
  Table2Icon,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { useToast } from '@/components/ui/ToastProvider';
import { http } from '@/lib/api/http';
import type { CheckpointReportV2, ExecutionObjective } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { answerLanguage } from '../answerLanguage';
import { AnswerLanguageProvider } from '../answerLanguageContext';
import { BlockRenderer } from '../blocks/BlockRenderer';
import { countBlockCitations } from '../blocks/citations';
import { EntityNamesProvider, entityNamesOf } from '../blocks/entityNames';
import { MediaMapProvider } from '../blocks/mediaText';
import { JAINA_LEAD, JAINA_MODULE_GAP } from '../blocks/modules';
import { narrativeThreeOf } from '../blocks/narrativeShape';
import { JainaProse } from '../blocks/prose';
import { normalizeJainaMarkdownTables } from '../jainaUtils';
import { JAINA_ANSWER_PROSE, JAINA_EVIDENCE_PROSE } from '../reading';
import {
  buildJainaReportV2SheetsExportRequest,
  createJainaReportV2HtmlFile,
  downloadFile,
  downloadJainaReportV2Html,
  downloadJainaReportV2Pdf,
  exportJainaReportToSheets,
  openJainaReportMailDraft,
  shareJainaReportFile,
} from '../reportExport';
import {
  isAnswerTemplateBlock,
  TemplateExecutive,
  TemplateJustification,
} from '../templates/TemplateBlock';
import {
  type AnswerStratum,
  JainaJustificationSection,
  partitionReportBlocks,
  SectionLabel,
  stratumOfBlock,
} from './JainaJustificationSection';
import { SaveDashboardButton } from './SaveDashboardButton';

const OBJECTIVE_STATUS_STYLE: Record<ExecutionObjective['status'], string> = {
  completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-red-500/15 text-red-600 dark:text-red-400',
  in_progress: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  blocked: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  deferred: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
  partial: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  cancelled: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
  pending: 'bg-muted text-muted-foreground',
};

type StratumRun = { stratum: AnswerStratum; blocks: CheckpointReportV2['blocks'] };

/**
 * The answer's blocks as runs of one stratum, in the Backend's order — nothing moves. A run
 * is what a stratum label sits over, and a run of two or more WHY blocks (a reading beside an
 * insight list) is what sits side by side on a wide answer.
 */
function runsByStratum(blocks: CheckpointReportV2['blocks']): StratumRun[] {
  const runs: StratumRun[] = [];
  for (const block of blocks) {
    const stratum = stratumOfBlock(block);
    const last = runs[runs.length - 1];
    if (last && last.stratum === stratum) last.blocks.push(block);
    else runs.push({ stratum, blocks: [block] });
  }
  return runs;
}

// Supplementary report context (reasoning, objectives, sources). These ride along
// in every persisted report but were previously dropped at the schema; surfacing
// them keeps a thin/degraded report from looking empty.
function ReportSupplementaryDetails({ report }: { report: CheckpointReportV2 }) {
  const objectives = report.execution_objectives;
  const sources = report.cached_sources;
  const reasoning = report.reasoning_trace.trim();

  if (objectives.length === 0 && sources.length === 0 && reasoning.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-col', JAINA_MODULE_GAP)}>
      {objectives.length > 0 ? (
        <details className="group rounded-xl bg-muted/40 px-3 py-2.5 sm:px-4">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
            Execution objectives ({objectives.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {objectives.map((objective) => (
              <li key={objective.id} className="flex items-start gap-2 text-xs">
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium capitalize',
                    OBJECTIVE_STATUS_STYLE[objective.status],
                  )}
                >
                  {objective.status.replace('_', ' ')}
                </span>
                <span className="min-w-0 flex-1 leading-snug text-muted-foreground">
                  {objective.title}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {reasoning.length > 0 ? (
        <details className="group rounded-xl bg-muted/40 px-3 py-2.5 sm:px-4">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
            Analysis
          </summary>
          <SafeMarkdown
            content={reasoning}
            className={cn('mt-2', JAINA_EVIDENCE_PROSE)}
            mode="static"
          />
        </details>
      ) : null}

      {sources.length > 0 ? (
        <Sources className="mb-0">
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((source) => (
              <Source key={source} href="#" title={source} />
            ))}
          </SourcesContent>
        </Sources>
      ) : null}
    </div>
  );
}

type JainaReportV2Props = {
  report: CheckpointReportV2;
  isStreaming: boolean;
  runId?: string;
  deliverySource?: 'live_render' | 'hydration_replay';
  /** The user turn this report answered, so saving it keeps the question with the blocks. */
  sourcePrompt?: string | null;
  onSuggestionClick?: (query: string) => void;
};

export function JainaReportV2({
  report,
  isStreaming,
  runId,
  deliverySource,
  sourcePrompt,
  onSuggestionClick,
}: JainaReportV2Props) {
  const { show } = useToast();
  const [hiddenBlockIds, setHiddenBlockIds] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState<'sheets' | 'share' | 'pdf' | 'html' | null>(null);
  // READING ORDER IS THE BACKEND'S, and re-sorting here destroyed it.
  //
  // `selectBlocksForPresentation` emits a report in exactly the order it is meant to be
  // read: the framing block that states the window, then the plan's modules in the order
  // the plan names them, then the closing blocks that read what is above them. Sorting that
  // array by `priority` threw all three away, because `priority` is an EMPHASIS rank
  // (primary/secondary), not a position — and `priorityFor` gives `primary` to the plan's
  // first module and `secondary` to everything else, including the opening `data_scope`
  // frame, which `composeDataScopeBlock` hard-codes to `secondary`.
  //
  // Measured on a live strategy turn (2026-09-21): the backend emitted
  // [data_scope, metric_grid, insight_list, actions] with ranks [1, 0, 0, 0], and this sort
  // rendered [metric_grid, insight_list, actions, data_scope] — the metric grid promoted to
  // the top of every answer, and the scope strip, whose whole job is to say what window the
  // figures cover BEFORE the figures, pushed below the closing actions. The Backend bench
  // asserts "the data_scope frame opens the report" and was green throughout, because it
  // grades the array and this component reordered it afterwards.
  //
  // `priority` is still projected to a numeric rank at the schema (persisted reports and the
  // export path read it); nothing renders position from it any more.
  const orderedBlocks = report.blocks;
  const visibleBlocks = useMemo(
    () => orderedBlocks.filter((block) => !hiddenBlockIds.has(block.block_id)),
    [hiddenBlockIds, orderedBlocks],
  );
  // Presentation only: the answer's own blocks stay with the answer, the figures it rests
  // on go under the justification. Each keeps the order above; exports, saved dashboards
  // and the module toggles still read the full `visibleBlocks` / `report.blocks`.
  const sections = useMemo(() => partitionReportBlocks(visibleBlocks), [visibleBlocks]);
  const templateBlocks = sections.answer.filter(isAnswerTemplateBlock);
  // A templated answer's J2 narrative is built from its found and why sections, so those two
  // steps drop their sentence under the evidence and keep their visual.
  const narrated = visibleBlocks.some(
    (block) => block.category === 'narrative' && narrativeThreeOf(block) !== null,
  );
  // One language per answer: the labels around the blocks follow the report, never the app.
  const language = answerLanguage(report);

  const hasMedia = report._meta.has_media && Object.keys(report.media_map).length > 0;
  // Derived from the rendered blocks rather than `_meta.has_citations` (the FE
  // report meta schema does not carry that flag), so the badge reflects exactly
  // the citations the report can surface.
  const citationCount = useMemo(() => countBlockCitations(report.blocks), [report.blocks]);
  // Names, never ids: every entity the report's own blocks put a name to, for the titles.
  const entityNames = useMemo(() => entityNamesOf(report.blocks), [report.blocks]);
  const acknowledgeDelivery = useCallback(
    async (kind: 'live_render' | 'hydration_replay' | 'pdf', status: 'success' | 'fallback') => {
      if (!runId) return;
      await http
        .request({
          path: `/api/agents/jaina/chat/runs/${encodeURIComponent(runId)}/delivery`,
          method: 'POST',
          body: { kind, status, report_id: `${runId}:checkpoint_report` },
        })
        .catch(() => undefined);
    },
    [runId],
  );
  useEffect(() => {
    if (isStreaming || !deliverySource) return;
    void acknowledgeDelivery(deliverySource, 'success');
  }, [acknowledgeDelivery, deliverySource, isStreaming]);
  const toggleBlock = useCallback((blockId: string) => {
    setHiddenBlockIds((current) => {
      const next = new Set(current);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }, []);
  // Compose the visible modules into a print-ready document and hand it to the
  // browser's print engine, which writes a real vector PDF.
  const handlePdfExport = useCallback(async () => {
    setExporting('pdf');
    try {
      await downloadJainaReportV2Pdf({ report, blocks: visibleBlocks });
      await acknowledgeDelivery('pdf', 'success');
    } catch (error) {
      await acknowledgeDelivery('pdf', 'fallback');
      show({
        title: 'Export failed',
        description:
          error instanceof Error ? error.message : 'Unable to generate the report PDF right now.',
        variant: 'error',
      });
    } finally {
      setExporting(null);
    }
  }, [acknowledgeDelivery, report, show, visibleBlocks]);

  const handleHtmlExport = useCallback(async () => {
    setExporting('html');
    try {
      await downloadJainaReportV2Html({ report, blocks: visibleBlocks });
    } catch (error) {
      show({
        title: 'Export failed',
        description:
          error instanceof Error ? error.message : 'Unable to generate the report HTML right now.',
        variant: 'error',
      });
    } finally {
      setExporting(null);
    }
  }, [report, show, visibleBlocks]);

  const handleSheetsExport = useCallback(async () => {
    setExporting('sheets');
    try {
      const result = await exportJainaReportToSheets(
        buildJainaReportV2SheetsExportRequest({ report, visibleBlocks }),
      );
      window.open(result.url, '_blank', 'noopener,noreferrer');
      show({ title: 'Google Sheet created', description: 'Your visible modules are ready.' });
    } catch (error) {
      show({
        title: 'Google Sheets export failed',
        description: error instanceof Error ? error.message : 'Unable to export the report.',
        variant: 'error',
      });
    } finally {
      setExporting(null);
    }
  }, [report, show, visibleBlocks]);

  const handleShare = useCallback(async () => {
    setExporting('share');
    try {
      const file = await createJainaReportV2HtmlFile({ report, blocks: visibleBlocks });
      const result = await shareJainaReportFile(file, 'Jaina performance report');
      if (result === 'unsupported') {
        downloadFile(file);
        openJainaReportMailDraft('Jaina performance report');
        show({
          title: 'Attach the downloaded report',
          description: 'Your email draft is open. Attach the downloaded report before sending.',
        });
      }
    } catch {
      show({
        title: 'Share failed',
        description: 'Unable to prepare the report for sharing right now.',
        variant: 'error',
      });
    } finally {
      setExporting(null);
    }
  }, [report, show, visibleBlocks]);

  // An answer is modules separated by space: no card around it, no rule between its parts.
  // The section is the container the modules query, so the same answer lays its reading out
  // side by side in a wide chat and stacks it in a 390px panel.
  const content = (
    <section className="@container mt-4 flex flex-col gap-4">
      <div className={cn('flex flex-col', JAINA_MODULE_GAP)}>
        {citationCount > 0 ? (
          <div className="flex items-center">
            <Badge
              variant="secondary"
              className="gap-1"
              aria-label={`Sourced from ${citationCount} citations`}
            >
              <BookIcon className="size-3" aria-hidden="true" />
              Sourced · {citationCount}
            </Badge>
          </div>
        ) : null}

        {/* Jaina's answer, set as an answer.
         *
         *  This was `text-sm leading-relaxed text-muted-foreground` — smaller and quieter
         *  than the very same sentence rendered by the plain-prose path in
         *  `JainaMessageItem`, and, by `reading.ts`'s own law, in the ink that means NOBODY
         *  JUDGED THIS. Streamdown sets no colour of its own on headings, bold runs or
         *  table cells, so that one class muted the entire answer: every `###`, every
         *  figure, every row. `JAINA_ANSWER_PROSE` is the one constant both routes now
         *  share, so the answer reads the same whether the turn shipped a report or not. */}
        {/* A templated answer's sentence IS the executive answer: printing Phase B's summary
         *  above it would state the answer twice, in two sets of words and possibly two sets
         *  of numbers. Only a report with no (visible) template block keeps the summary. */}
        {report.executive_summary && templateBlocks.length === 0 ? (
          <div data-report-part="sentence">
            <JainaProse
              content={normalizeJainaMarkdownTables(report.executive_summary)}
              className={cn(JAINA_ANSWER_PROSE, JAINA_LEAD)}
              mode={isStreaming ? 'streaming' : 'static'}
            />
          </div>
        ) : null}

        {/* The rest of the answer — the reading, the moves — set as part of it. */}
        {sections.answer.length > 0 ? (
          <div data-report-section="answer" className={cn('flex flex-col', JAINA_MODULE_GAP)}>
            {/* A templated answer puts its sentence and chart here and its steps under the
             *  justification below — the same answer/justification split as every block.
             *
             *  Each stratum is labelled where it BEGINS — Why over the reading, Action over
             *  the moves — and the blocks stay in the Backend's order; a label is inserted
             *  when the stratum changes, never a block moved to sit under one. The J2 card's
             *  own parts (the window line, the tiles, a three-box narrative) label themselves
             *  and take none: see `stratumOfBlock`. */}
            {runsByStratum(sections.answer).map(({ stratum, blocks }) => {
              const rendered = blocks.map((block) =>
                isAnswerTemplateBlock(block) ? (
                  <TemplateExecutive key={block.block_id} block={block} />
                ) : (
                  <BlockRenderer key={block.block_id} block={block} isStreaming={isStreaming} />
                ),
              );
              return (
                <Fragment key={blocks[0].block_id}>
                  {stratum !== 'answer' ? (
                    <SectionLabel stratum={stratum} language={language} />
                  ) : null}
                  {stratum === 'why' && blocks.length > 1 ? (
                    <div className="grid gap-3 @3xl:grid-cols-2" data-report-run="why">
                      {rendered}
                    </div>
                  ) : (
                    rendered
                  )}
                </Fragment>
              );
            })}
          </div>
        ) : null}

        {/* The evidence under the answer, marked as such. Without a heading and a rule the
         *  figures read as further paragraphs of the same statement rather than as what they
         *  are — the data it rests on. */}
        <JainaJustificationSection
          blocks={sections.justification}
          language={language}
          renderBlock={(block) => <BlockRenderer block={block} isStreaming={isStreaming} />}
          leading={
            templateBlocks.length > 0
              ? templateBlocks.map((block) => (
                  <TemplateJustification key={block.block_id} block={block} narrated={narrated} />
                ))
              : undefined
          }
        />

        {/* Chrome, so it sits under the thing it controls. A row of toggles named after
         *  every block used to be the first element in the report — the reader met the
         *  table of contents before the answer. */}
        {!isStreaming && orderedBlocks.length > 0 ? (
          <fieldset
            aria-label="Report modules"
            className="flex flex-wrap items-center gap-2 border-0 p-0"
          >
            <legend className="mb-1 text-xs font-medium text-muted-foreground">
              Report modules
            </legend>
            {orderedBlocks.map((block) => {
              const isVisible = !hiddenBlockIds.has(block.block_id);
              return (
                <Button
                  key={block.block_id}
                  type="button"
                  size="xs"
                  variant={isVisible ? 'secondary' : 'outline'}
                  aria-label={`${isVisible ? 'Hide' : 'Show'} ${block.title} module`}
                  aria-pressed={isVisible}
                  onClick={() => toggleBlock(block.block_id)}
                >
                  {isVisible ? <EyeIcon aria-hidden="true" /> : <EyeOffIcon aria-hidden="true" />}
                  {block.title}
                </Button>
              );
            })}
          </fieldset>
        ) : null}

        {!isStreaming ? <ReportSupplementaryDetails report={report} /> : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Export the visible modules as a PDF or a self-contained HTML file.
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <SaveDashboardButton
            blocks={visibleBlocks}
            disabled={isStreaming || exporting !== null}
            report={report}
            sourcePrompt={sourcePrompt}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleSheetsExport()}
            disabled={isStreaming || exporting !== null}
            aria-label="Export visible modules to Google Sheets"
          >
            <Table2Icon className="size-3.5" />
            Google Sheets
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleShare()}
            disabled={isStreaming || exporting !== null}
            aria-label="Share report by email"
          >
            <Share2Icon className="size-3.5" />
            Email
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleHtmlExport()}
            disabled={isStreaming || exporting !== null}
            aria-label="Export report as HTML"
          >
            <CodeIcon className="size-3.5" />
            {exporting === 'html' ? 'Preparing…' : 'Export HTML'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handlePdfExport()}
            disabled={isStreaming || exporting !== null}
            aria-label="Export report as PDF"
          >
            <FileDownIcon className="size-3.5" />
            {exporting === 'pdf' ? 'Preparing…' : 'Export PDF'}
          </Button>
        </div>
      </footer>

      {/* Follow-ups LAST. The J2 card ends where the reader's next question begins: the
       *  sentence, the tiles, the reading, the evidence and the chrome all come before the
       *  chips that start another turn. */}
      {report.follow_up_questions.length > 0 ? (
        <div className="space-y-2 pt-2" data-report-section="follow-ups">
          <Suggestions className="pb-1">
            {report.follow_up_questions.map((question, index) => (
              <Suggestion
                key={`${question}-${index}`}
                suggestion={question}
                onClick={onSuggestionClick}
              />
            ))}
          </Suggestions>
        </div>
      ) : null}
    </section>
  );

  // The blocks that print a word of their own (the tile's read, the narrative's three
  // labels) read the language from here, through `BlockRenderer`'s lazy boundary.
  const localized = <AnswerLanguageProvider language={language}>{content}</AnswerLanguageProvider>;

  if (!hasMedia) return localized;

  return (
    <MediaMapProvider mediaMap={report.media_map}>
      <EntityNamesProvider names={entityNames}>{localized}</EntityNamesProvider>
    </MediaMapProvider>
  );
}
