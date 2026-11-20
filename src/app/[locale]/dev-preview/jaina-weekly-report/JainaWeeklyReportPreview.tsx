'use client';

import type { WeeklyReportBody } from '@continuum/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { JainaReportV2 } from '@/components/paid-media/jaina/components/JainaReportV2';
import {
  renderExportDocument,
  serializeExportDocument,
} from '@/components/paid-media/jaina/export/renderExportDocument';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { JainaBrandScopeProvider } from '@/lib/jaina/brandScope';
import { prepareDashboardBlocks } from '@/lib/jaina/dashboardBlocks';
import { checkpointReportV2Schema } from '@/lib/jaina/schemas';

export type WeeklyReportSource = { kind: 'live' | 'fixture'; path: string };

type ExportState = 'idle' | 'building' | 'ready' | 'failed';

declare global {
  interface Window {
    __jainaExportHtml?: string;
    /** The parsed weekly body, so the bench asserts the page against what it was given. */
    __weeklyReportBody?: WeeklyReportBody | null;
  }
}

// Harness for `jaina:weekly-report:render:bench`. Renders the weekly report through the REAL
// J2 card (`JainaReportV2` → TemplateBlock → the template registry), then builds the REAL
// export document from it, exactly as the card's PDF/HTML buttons do. The report is the one
// the Backend's live bench wrote when present, else the fixture — the page says which, so a
// green run on the fixture can never read as a green run on live data. Not linked from any nav.
export function JainaWeeklyReportPreview({
  json,
  source,
}: {
  json: unknown;
  source: WeeklyReportSource;
}) {
  const parsed = useMemo(() => checkpointReportV2Schema.safeParse(json), [json]);
  const [state, setState] = useState<ExportState>('idle');
  const [error, setError] = useState<string | null>(null);

  const report = parsed.success ? parsed.data : null;
  // What the card's Save would persist: the plan it builds, without writing anything.
  const savePlan = useMemo(
    () => (report ? prepareDashboardBlocks(report, report.blocks) : null),
    [report],
  );

  useEffect(() => {
    const block = report?.blocks.find(
      (candidate) =>
        candidate.category === 'answer_template' && candidate.template_id === 'weekly_report',
    );
    window.__weeklyReportBody =
      block?.category === 'answer_template' ? (block.weekly_report ?? null) : null;
  }, [report]);

  const build = useCallback(async () => {
    if (!report) return;
    setState('building');
    setError(null);
    document.querySelectorAll('[data-jaina-export-frame]').forEach((frame) => frame.remove());
    try {
      const handle = await renderExportDocument({
        report,
        blocks: report.blocks,
        title: 'Weekly report',
      });
      window.__jainaExportHtml = serializeExportDocument(handle.doc);
      // Deliberately NOT cleaned up: the bench inspects the live frame.
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState('failed');
    }
  }, [report]);

  return (
    <main
      className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6"
      data-export-state={state}
      data-report-source={source.kind}
      data-save-plan={savePlan ? (savePlan.ok ? 'ok' : savePlan.missing) : 'none'}
    >
      <h1 className="text-lg font-semibold text-foreground">Weekly report harness</h1>
      <p className="text-sm text-muted-foreground" data-testid="report-source">
        {source.kind === 'live'
          ? `Rendering the live report from ${source.path}.`
          : `No live report at ${source.path}; rendering the fixture.`}
      </p>
      {report ? (
        <ToastProvider>
          <JainaBrandScopeProvider brandId="weekly-report-bench" adAccountId={null}>
            <JainaReportV2 report={report} isStreaming={false} />
          </JainaBrandScopeProvider>
        </ToastProvider>
      ) : (
        <pre className="whitespace-pre-wrap text-sm text-destructive" data-report-parse-error>
          {parsed.error?.message}
        </pre>
      )}
      <button
        type="button"
        onClick={() => void build()}
        disabled={!report}
        className="rounded-md border border-border px-3 py-1.5 text-sm"
      >
        Build export document
      </button>
      {error ? (
        <p data-export-error className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </main>
  );
}
