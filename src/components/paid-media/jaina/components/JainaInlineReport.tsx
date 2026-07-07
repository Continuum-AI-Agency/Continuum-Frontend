'use client';

import { DownloadIcon, FileCode2Icon } from 'lucide-react';
import * as React from 'react';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { useToast } from '@/components/ui/ToastProvider';
import { type FrontendCheckpointReport, hasReportContent } from '@/lib/jaina/schemas';
import { downloadJainaReportHtml, downloadJainaReportPdf } from '../reportExport';
import { buildJitSnapshotFallbackTables } from '../reportTableUtils';
import { isJainaChartInput, JainaReportCharts } from './JainaReportCharts';
import { JainaReportMetrics } from './JainaReportMetrics';
import { JainaReportRecommendations } from './JainaReportRecommendations';
import { JainaReportSections } from './JainaReportSections';
import { JainaReportTables } from './JainaReportTables';

type JainaInlineReportProps = {
  report: FrontendCheckpointReport | null;
  isStreaming: boolean;
  onSuggestionClick?: (query: string) => void;
};

export function JainaInlineReport({
  report,
  isStreaming,
  onSuggestionClick,
}: JainaInlineReportProps) {
  const { show } = useToast();
  const fallbackTables = React.useMemo(
    () => (report ? buildJitSnapshotFallbackTables(report) : []),
    [report],
  );

  const topLevelCharts = React.useMemo(
    () => (report ? report.graphs.filter((chart) => isJainaChartInput(chart)) : []),
    [report],
  );

  const effectiveRecommendations = React.useMemo(() => {
    if (!report) return [];
    if (report.strategic_recommendations.length > 0) {
      return report.strategic_recommendations;
    }
    return report.sections.flatMap((section) => section.actions);
  }, [report]);

  const handleDownload = React.useCallback(async () => {
    if (!report) return;
    try {
      await downloadJainaReportPdf({
        report,
        fallbackTables,
      });
    } catch {
      show({
        title: 'Export failed',
        description: 'Unable to generate PDF report right now.',
        variant: 'error',
      });
    }
  }, [fallbackTables, report, show]);

  const handleHtmlExport = React.useCallback(() => {
    if (!report) return;
    try {
      downloadJainaReportHtml({
        report,
        fallbackTables,
      });
    } catch {
      show({
        title: 'Export failed',
        description: 'Unable to generate HTML report right now.',
        variant: 'error',
      });
    }
  }, [fallbackTables, report, show]);

  if (!report || !hasReportContent(report)) return null;

  const blockLabel = (category: string): string => {
    if (category === 'summary_breakdown') return 'Summary';
    if (category === 'insight_recommendation') return 'Insight';
    if (category === 'data') return 'Data';
    if (category === 'graph') return 'Graph';
    return category;
  };

  return (
    <section className="mt-6 space-y-6 border-t border-border/60 pt-6">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {report.report_title || 'Checkpoint Analysis'}
        </h2>
        <div className="flex items-center gap-2">
          <Pill variant="violet" className="uppercase text-2xs tracking-wide">
            {report.language || 'EN'}
          </Pill>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleDownload()}
            disabled={isStreaming}
            aria-label="Download report as PDF"
          >
            <DownloadIcon className="size-3.5" />
            Download
          </Button>
        </div>
      </header>

      {report.executive_summary ? (
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/85">Executive Summary</span>
          <SafeMarkdown
            content={report.executive_summary}
            className="text-base leading-6 text-muted-foreground"
            mode={isStreaming ? 'streaming' : 'static'}
          />
        </div>
      ) : null}

      {report.blocks.length > 0 ? (
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/85">Checkpoint Blocks</span>
          <div className="space-y-2">
            {report.blocks.map((block) => (
              <div
                key={block.block_id}
                className="rounded-lg border border-border/60 bg-background/60 px-3 py-2"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Pill variant="outline" className="text-2xs uppercase tracking-wide">
                    {blockLabel(block.category)}
                  </Pill>
                  <Pill variant="muted" className="text-2xs">
                    {block.scope}
                  </Pill>
                </div>
                <span className="text-sm font-medium block">{block.title}</span>
                <span className="text-xs text-muted-foreground">{block.summary}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <JainaReportMetrics metrics={report.performance_snapshot} />
      <JainaReportSections sections={report.sections} isStreaming={isStreaming} />
      <JainaReportCharts charts={topLevelCharts} />
      <JainaReportTables tables={fallbackTables} />
      <JainaReportRecommendations
        recommendations={effectiveRecommendations}
        isStreaming={isStreaming}
      />

      {report.follow_up_questions.length > 0 ? (
        <div className="space-y-2 pt-2">
          <span className="text-sm font-medium text-foreground/85">Follow-up</span>
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
          Export includes summary, metrics, charts, tables, recommendations, and follow-up prompts.
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleHtmlExport}
          disabled={isStreaming}
          aria-label="Export response as HTML"
        >
          <FileCode2Icon className="size-3.5" />
          Export HTML
        </Button>
      </footer>
    </section>
  );
}
