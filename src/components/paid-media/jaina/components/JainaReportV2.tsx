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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { useToast } from '@/components/ui/ToastProvider';
import { http } from '@/lib/api/http';
import type { CheckpointReportV2, ExecutionObjective } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { BlockRenderer } from '../blocks/BlockRenderer';
import { countBlockCitations } from '../blocks/citations';
import { MediaMapProvider } from '../blocks/mediaText';
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
    <div className="space-y-3 border-t border-border/40 pt-3">
      {objectives.length > 0 ? (
        <details className="group rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
            Execution objectives ({objectives.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {objectives.map((objective) => (
              <li key={objective.id} className="flex items-start gap-2 text-xs">
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium capitalize',
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
        <details className="group rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
            Analysis
          </summary>
          <SafeMarkdown
            content={reasoning}
            className="mt-2 text-xs leading-relaxed text-muted-foreground/80"
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
  onSuggestionClick?: (query: string) => void;
};

export function JainaReportV2({
  report,
  isStreaming,
  runId,
  deliverySource,
  onSuggestionClick,
}: JainaReportV2Props) {
  const { show } = useToast();
  const [hiddenBlockIds, setHiddenBlockIds] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState<'sheets' | 'share' | 'pdf' | 'html' | null>(null);
  const sortedBlocks = useMemo(
    () => [...report.blocks].sort((a, b) => a.priority - b.priority),
    [report.blocks],
  );
  const visibleBlocks = useMemo(
    () => sortedBlocks.filter((block) => !hiddenBlockIds.has(block.block_id)),
    [hiddenBlockIds, sortedBlocks],
  );

  const hasMedia = report._meta.has_media && Object.keys(report.media_map).length > 0;
  // Derived from the rendered blocks rather than `_meta.has_citations` (the FE
  // report meta schema does not carry that flag), so the badge reflects exactly
  // the citations the report can surface.
  const citationCount = useMemo(() => countBlockCitations(report.blocks), [report.blocks]);
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

  const content = (
    <section className="mt-4 space-y-4">
      {!isStreaming && sortedBlocks.length > 0 ? (
        <fieldset
          aria-label="Report modules"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-muted/20 p-2"
        >
          <legend className="px-1 text-xs font-medium text-muted-foreground">Report modules</legend>
          {sortedBlocks.map((block) => {
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

      <div className="space-y-4">
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

        {report.executive_summary ? (
          <SafeMarkdown
            content={report.executive_summary}
            className="text-sm leading-relaxed text-muted-foreground"
            mode={isStreaming ? 'streaming' : 'static'}
          />
        ) : null}

        {visibleBlocks.map((block) => (
          <BlockRenderer key={block.block_id} block={block} isStreaming={isStreaming} />
        ))}

        {!isStreaming ? <ReportSupplementaryDetails report={report} /> : null}
      </div>

      {report.follow_up_questions.length > 0 ? (
        <div className="space-y-2 pt-2">
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

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <span className="text-xs text-muted-foreground">
          Export the visible modules as a PDF or a self-contained HTML file.
        </span>
        <div className="flex flex-wrap items-center gap-2">
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
    </section>
  );

  if (!hasMedia) return content;

  return <MediaMapProvider mediaMap={report.media_map}>{content}</MediaMapProvider>;
}
