'use client';


import { DownloadIcon, FileCode2Icon, Share2Icon, Table2Icon } from 'lucide-react';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { type FrontendCheckpointReport, hasReportContent } from '@/lib/jaina/schemas';
import { JainaProse } from '../blocks/prose';
import {
  buildLegacyJainaSheetsExportRequest,
  createJainaReportHtmlFile,
  downloadFile,
  downloadJainaReportHtml,
  downloadJainaReportPdf,
  exportJainaReportToSheets,
  openJainaReportMailDraft,
  shareJainaReportFile,
} from '../reportExport';
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
  const formatUiError = useUiErrorMessage();
  const uiText = useTranslations('scale');
  const { show } = useToast();
  const [exporting, setExporting] = React.useState<'sheets' | 'share' | null>(null);
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
        title: uiText('export_failed_e94d3ee'),
        description: uiText('unable_to_generate_pdf_report_right_now_b787d7b'),
        variant: 'error',
      });
    }
  }, [fallbackTables, report, show, uiText]);

  const handleHtmlExport = React.useCallback(() => {
    if (!report) return;
    try {
      downloadJainaReportHtml({
        report,
        fallbackTables,
      });
    } catch {
      show({
        title: uiText('export_failed_e94d3ee'),
        description: uiText('unable_to_generate_html_report_right_now_3bed49b'),
        variant: 'error',
      });
    }
  }, [fallbackTables, report, show, uiText]);

  const handleSheetsExport = React.useCallback(async () => {
    if (!report) return;
    setExporting('sheets');
    try {
      const result = await exportJainaReportToSheets(
        buildLegacyJainaSheetsExportRequest({ report, fallbackTables }),
      );
      window.open(result.url, '_blank', 'noopener,noreferrer');
      show({
        title: uiText('google_sheet_created_625ad8c'),
        description: uiText('your_report_is_ready_in_google_sheets_b6087a7'),
      });
    } catch (error) {
      show({
        title: uiText('google_sheets_export_failed_6b033bc'),
        description: formatUiError(error),
        variant: 'error',
      });
    } finally {
      setExporting(null);
    }
  }, [fallbackTables, report, show, formatUiError, uiText]);

  const handleShare = React.useCallback(async () => {
    if (!report) return;
    setExporting('share');
    try {
      const file = createJainaReportHtmlFile({ report, fallbackTables });
      const result = await shareJainaReportFile(file, report.report_title || 'Jaina report');
      if (result === 'unsupported') {
        downloadFile(file);
        openJainaReportMailDraft(report.report_title || 'Jaina report');
        show({
          title: uiText('attach_the_downloaded_report_ffa76ca'),
          description: uiText('your_email_draft_is_open_attach_the_downloade_cea581f'),
        });
      }
    } catch {
      show({
        title: uiText('share_failed_609fbf0'),
        description: uiText('unable_to_prepare_the_report_for_sharing_righ_60230b9'),
        variant: 'error',
      });
    } finally {
      setExporting(null);
    }
  }, [fallbackTables, report, show, uiText]);

  if (!report || !hasReportContent(report)) return null;

  const blockLabel = (category: string): string => {
    if (category === 'summary_breakdown') return 'Summary';
    if (category === 'insight_recommendation') return 'Insight';
    if (category === 'data') return 'Data';
    if (category === 'graph') return 'Graph';
    return category;
  };

  return (
    <section className="mt-6 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {report.report_title || uiText('checkpoint_analysis_d632c22')}
        </h2>
        <div className="flex items-center gap-2">
          <Pill variant="violet" className="uppercase text-xs tracking-wide">
            {report.language || 'EN'}
          </Pill>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleDownload()}
            disabled={isStreaming}
            aria-label={uiText('download_report_as_pdf_bb6939f')}
          >
            <DownloadIcon className="size-3.5" />
            {uiText('download_d6eafe8')}
          </Button>
        </div>
      </header>

      {report.executive_summary ? (
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/85">
            {uiText('executive_summary_53d548a')}
          </span>
          <JainaProse
            content={report.executive_summary}
            className="text-base leading-6 text-muted-foreground"
            mode={isStreaming ? 'streaming' : 'static'}
          />
        </div>
      ) : null}

      {report.blocks.length > 0 ? (
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/85">
            {uiText('checkpoint_blocks_4f463e6')}
          </span>
          <div className="space-y-2">
            {report.blocks.map((block) => (
              <div key={block.block_id} className="rounded-xl bg-muted/40 px-3 py-2.5">
                <div className="mb-1 flex items-center gap-2">
                  <Pill variant="outline" className="text-xs uppercase tracking-wide">
                    {blockLabel(block.category)}
                  </Pill>
                  <Pill variant="muted" className="text-xs">
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
          <span className="text-sm font-medium text-foreground/85">
            {uiText('follow_up_09b2d9c')}
          </span>
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

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {uiText('export_includes_summary_metrics_charts_tables_81b7b72')}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleSheetsExport()}
            disabled={isStreaming || exporting !== null}
            aria-label={uiText('export_report_to_google_sheets_cd12c3b')}
          >
            {uiText.rich('sentence_7ada52d96afe', {
              v0: () => <Table2Icon className="size-3.5" />,
            })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleShare()}
            disabled={isStreaming || exporting !== null}
            aria-label={uiText('share_report_by_email_6991803')}
          >
            <Share2Icon className="size-3.5" />
            {uiText('email_969ccbd')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleHtmlExport}
            disabled={isStreaming || exporting !== null}
            aria-label={uiText('export_response_as_html_18a729c')}
          >
            <FileCode2Icon className="size-3.5" />
            {uiText('export_html_17f681a')}
          </Button>
        </div>
      </footer>
    </section>
  );
}
