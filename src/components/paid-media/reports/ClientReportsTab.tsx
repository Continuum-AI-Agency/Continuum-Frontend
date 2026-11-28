'use client';

// Performance → Reports: the weekly client report (results vs targets, week over week, month to
// date vs the same point last month, the month-end forecast as an 80% range, what changed,
// recommendations and client asks). The Backend composes every figure and sentence; this view
// formats numbers and lays them out. The report's own prose stays in the brand's language.
// Staff see drafts and review, generate and share; a client sees reviewed weeks only.

import {
  CLIENT_REPORT_METRICS,
  type ClientReportMetric,
  type ClientReportMetricKey,
  type ClientReportSummary,
  type WeeklyClientReport,
} from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import {
  TriangleAlert as AlertTriangle,
  ArrowDownToLine as Download,
  FileText,
  Link2,
  Mail,
  RefreshCw,
  Target,
  Undo2,
} from '@/components/icons';
import { Pill } from '@/components/kibo-ui/pill';
import { DeltaBadge } from '@/components/shared/DeltaBadge';
import { Panel } from '@/components/shared/Panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toast-imperative';
import {
  fetchClientReportHtml,
  shareUrlOf,
  useClientReport,
  useClientReportActions,
  useClientReports,
  useClientReportTargets,
} from '@/hooks/useClientReports';
import { ApiError } from '@/lib/api/errors';

const K = {
  title: 'weekly_client_report_07d976a',
  week: 'week_since_until_9ee3107',
  draft: 'draft_staff_review_80752fd',
  reviewed: 'reviewed_31ef859',
  generate: 'generate_this_week_7f8cdc5',
  generating: 'reading_the_ad_platforms_d597f0d',
  review: 'mark_reviewed_277c924',
  withdraw: 'withdraw_47e5641',
  withdrawn: 'withdrawn_its_share_links_no_longer_open_203d343',
  reviewedWeek: 'this_week_is_reviewed_and_may_be_shared_withdraw_it_fb0cf19',
  pdf: 'export_pdf_3dd7d56',
  email: 'copy_email_draft_b391eba',
  share: 'copy_share_link_dd71c73',
  shareNeedsReview: 'review_the_draft_before_sharing_it_a4d62d0',
  emailCopied: 'email_draft_copied_3046d80',
  linkCopied: 'share_link_copied_read_only_expires_date_058ee85',
  actionFailed: 'that_did_not_work_try_again_fa9c0cf',
  setTargets: 'set_targets_3b7503d',
  targetsTitle: 'monthly_targets_7dc7141',
  targetsDescription: 'the_report_reads_results_against_these_leave_a_57eff3f',
  month: 'month_082bc37',
  saveTargets: 'save_targets_cc8a3ca',
  targetsSaved: 'targets_saved_859903d',
  emptyTitle: 'no_weekly_report_yet_af181bb',
  emptyStaff: 'reports_are_drafted_every_monday_for_brands_with_dae1ae6',
  emptyMember: 'your_team_shares_the_weekly_report_here_once_f7891eb',
  loadFailed: 'the_report_could_not_be_loaded_5f3942b',
  staleTitle: 'incomplete_data_80845ee',
  staleThrough: 'source_is_complete_only_through_date_metrics_stop_0483d67',
  staleUnread: 'source_could_not_be_read_metrics_leave_its_c3d384a',
  colMetric: 'metric_b2bb760',
  colWeek: 'this_week_7b72883',
  colVsPrior: 'vs_prior_week_0e4e67d',
  colMtd: 'month_to_date_3141754',
  colVsLastMonth: 'vs_same_point_last_month_5ad7022',
  colTarget: 'target_61ad50a',
  colForecast: 'month_end_forecast_80_range_b766852',
  colVsTarget: 'forecast_vs_target_756fcda',
  colNext: 'next_month_8abf7cf',
  postedTwice: 'posted_on_the_1st_and_15th_58d0978',
  dataThrough: 'data_through_date_ee578ae',
  changes: 'what_changed_7e4b919',
  recommendations: 'recommendations_4faa65b',
  asks: 'what_we_need_from_the_client_26413da',
  method: 'forecast_method_5299707',
  sources: 'sources_2eb56be',
  nothing: 'nothing_this_week_393b907',
} as const;

const METRIC_LABELS = {
  spend: 'spend_14eeee8',
  leads: 'leads_f12ee6d',
  cpl: 'cost_per_lead_ea87e1a',
  tours: 'tours_4257140',
  lead_to_tour: 'lead_tour_131900e',
  altas: 'sign_ups_609b051',
  cost_per_alta: 'cost_per_sign_up_2c3720f',
  attendance: 'attendance_b689313',
  sales: 'sales_d0edfb6',
} as const satisfies Record<ClientReportMetricKey, string>;

type Format = (metric: Pick<ClientReportMetric, 'unit'>, value: number | null) => string;

function useFormat(report: WeeklyClientReport | undefined): Format {
  const locale = useLocale();
  return React.useCallback(
    (metric, value) => {
      if (value === null || !report) return '—';
      if (metric.unit === 'ratio')
        return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
          value,
        );
      if (metric.unit === 'money')
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: report.brand.currency,
          // Cents only where they matter: a USD 0.36 cost per lead is not "$0".
          maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
        }).format(value);
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
    },
    [locale, report],
  );
}

function Change({ value, lowerIsBetter }: { value: number | null; lowerIsBetter: boolean }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <DeltaBadge value={value * 100} isPercent goodWhenDown={lowerIsBetter} />;
}

function StatusPill({ summary }: { summary: ClientReportSummary }) {
  const t = useTranslations('scale');
  return summary.status === 'reviewed' ? (
    <Pill variant="success">{t(K.reviewed)}</Pill>
  ) : (
    <Pill variant="warning">{t(K.draft)}</Pill>
  );
}

function StaleSources({ report }: { report: WeeklyClientReport }) {
  const t = useTranslations('scale');
  if (report.stale_sources.length === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{t(K.staleTitle)}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {report.stale_sources.map((stale) => {
            const metrics = stale.metrics.map((key) => t(METRIC_LABELS[key])).join(', ');
            return (
              <li key={stale.source}>
                {stale.data_through
                  ? t(K.staleThrough, { source: stale.source, date: stale.data_through, metrics })
                  : t(K.staleUnread, { source: stale.source, metrics })}
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function MetricsTable({ report }: { report: WeeklyClientReport }) {
  const t = useTranslations('scale');
  const format = useFormat(report);
  const range = (metric: ClientReportMetric, value: ClientReportMetric['forecast']['month_end']) =>
    value === null
      ? '—'
      : value.low === value.high
        ? format(metric, value.mid)
        : `${format(metric, value.mid)} (${format(metric, value.low)}–${format(metric, value.high)})`;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t(K.colMetric)}</TableHead>
          <TableHead className="text-right">{t(K.colWeek)}</TableHead>
          <TableHead className="text-right">{t(K.colVsPrior)}</TableHead>
          <TableHead className="text-right">{t(K.colMtd)}</TableHead>
          <TableHead className="text-right">{t(K.colVsLastMonth)}</TableHead>
          <TableHead className="text-right">{t(K.colTarget)}</TableHead>
          <TableHead className="text-right">{t(K.colForecast)}</TableHead>
          <TableHead className="text-right">{t(K.colVsTarget)}</TableHead>
          <TableHead className="text-right">
            {t(K.colNext)} ({report.next_month})
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {report.metrics.map((metric) => (
          <TableRow key={metric.key}>
            <TableCell>
              <div className="font-medium">{t(METRIC_LABELS[metric.key])}</div>
              <div className="text-muted-foreground text-xs">
                {t(K.dataThrough, { date: metric.data_through })}
              </div>
            </TableCell>
            {metric.cadence === 'semi_monthly' ? (
              <TableCell colSpan={2} className="text-right text-muted-foreground text-xs">
                {t(K.postedTwice)}
              </TableCell>
            ) : (
              <>
                <TableCell className="text-right">{format(metric, metric.week.value)}</TableCell>
                <TableCell className="text-right">
                  <Change value={metric.week.change} lowerIsBetter={metric.lower_is_better} />
                </TableCell>
              </>
            )}
            <TableCell className="text-right">{format(metric, metric.month.value)}</TableCell>
            <TableCell className="text-right">
              <Change value={metric.month.change} lowerIsBetter={metric.lower_is_better} />
            </TableCell>
            <TableCell className="text-right">
              {metric.target ? format(metric, metric.target.value) : '—'}
            </TableCell>
            <TableCell className="text-right">{range(metric, metric.forecast.month_end)}</TableCell>
            <TableCell className="text-right">
              <Change
                value={metric.target?.forecast_gap ?? null}
                lowerIsBetter={metric.lower_is_better}
              />
            </TableCell>
            <TableCell className="text-right">
              {range(metric, metric.forecast.next_month)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Lines({ items }: { items: Array<{ key: string; strong: string; rest: string }> }) {
  const t = useTranslations('scale');
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{t(K.nothing)}</p>;
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map((item) => (
        <li key={item.key}>
          <span className="font-medium">{item.strong}</span> {item.rest}
        </li>
      ))}
    </ul>
  );
}

function TargetsDialog({
  brandId,
  report,
  open,
  onOpenChange,
}: {
  brandId: string;
  report: WeeklyClientReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('scale');
  const [month, setMonth] = React.useState(report.month);
  const targets = useClientReportTargets(brandId, open ? month : null);
  const { saveTargets } = useClientReportActions(brandId);
  const units = new Map(report.metrics.map((metric) => [metric.key, metric.unit]));
  const keys = CLIENT_REPORT_METRICS.filter((key) => units.has(key));
  const [values, setValues] = React.useState<Partial<Record<ClientReportMetricKey, string>>>({});
  React.useEffect(() => {
    const stored = (targets.data?.targets ?? []).filter((target) => target.month === month);
    setValues(
      Object.fromEntries(
        stored.map((target) => [
          target.metric,
          String(units.get(target.metric) === 'ratio' ? target.value * 100 : target.value),
        ]),
      ),
    );
    // `units` is derived from the report, which the dialog is keyed to.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  }, [targets.data, month]);
  const save = () =>
    saveTargets.mutate(
      {
        month,
        targets: keys.map((key) => {
          const raw = values[key]?.trim();
          const value = raw ? Number(raw) : null;
          return {
            metric: key,
            value:
              value === null || Number.isNaN(value)
                ? null
                : units.get(key) === 'ratio'
                  ? value / 100
                  : value,
          };
        }),
      },
      {
        onSuccess: () => {
          toast.success(t(K.targetsSaved));
          onOpenChange(false);
        },
        onError: () => toast.error(t(K.actionFailed)),
      },
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(K.targetsTitle)}</DialogTitle>
          <DialogDescription>{t(K.targetsDescription)}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label>{t(K.month)}</Label>
            <Select value={month} onValueChange={(value) => value && setMonth(value)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={report.month}>{report.month}</SelectItem>
                <SelectItem value={report.next_month}>{report.next_month}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {keys.map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label htmlFor={`target-${key}`}>
                {t(METRIC_LABELS[key])}
                {units.get(key) === 'ratio' ? ' (%)' : ''}
              </Label>
              <Input
                id={`target-${key}`}
                className="w-40 text-right"
                inputMode="decimal"
                value={values[key] ?? ''}
                onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saveTargets.isPending || targets.isLoading}>
            {t(K.saveTargets)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function copy(text: string, done: string, failed: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error(failed);
  }
}

export function ClientReportsTab({ brandId }: { brandId: string }) {
  const t = useTranslations('scale');
  const locale = useLocale();
  const list = useClientReports(brandId);
  const [selected, setSelected] = React.useState<string | null>(null);
  const reports = list.data?.reports ?? [];
  const id = selected ?? reports[0]?.id ?? null;
  const detail = useClientReport(brandId, id);
  const actions = useClientReportActions(brandId);
  const [targetsOpen, setTargetsOpen] = React.useState(false);
  const canReview = list.data?.can_review ?? false;
  const report = detail.data?.draft.report;
  const summary = detail.data?.summary;

  const generate = () =>
    actions.generate.mutate(undefined, {
      onSuccess: (generated) => setSelected(generated.summary.id),
      onError: (error) =>
        error instanceof ApiError && error.status === 409
          ? toast.warning(t(K.reviewedWeek))
          : toast.error(t(K.actionFailed)),
    });
  const exportPdf = async () => {
    if (!id) return;
    // Opened before the await so the browser treats it as the click's own window.
    const page = window.open('', '_blank');
    try {
      const html = await fetchClientReportHtml(brandId, id);
      if (!page) return;
      page.document.open();
      page.document.write(html);
      page.document.close();
      page.focus();
      page.print();
    } catch {
      page?.close();
      toast.error(t(K.actionFailed));
    }
  };
  const share = () => {
    if (!summary) return;
    if (summary.status !== 'reviewed') {
      toast.warning(t(K.shareNeedsReview));
      return;
    }
    actions.share.mutate(summary.id, {
      onSuccess: (link) =>
        void copy(
          shareUrlOf(link),
          t(K.linkCopied, {
            date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
              new Date(link.expires_at),
            ),
          }),
          t(K.actionFailed),
        ),
      onError: () => toast.error(t(K.actionFailed)),
    });
  };

  if (list.isLoading) {
    return (
      <div className="flex flex-col gap-3 p-[var(--card-pad)]">
        <Skeleton className="h-8 w-72 bg-muted/70" />
        <Skeleton className="h-64 w-full bg-muted/70" />
      </div>
    );
  }
  if (list.isError) {
    return <p className="p-[var(--card-pad)] text-destructive text-sm">{t(K.loadFailed)}</p>;
  }
  if (reports.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t(K.emptyTitle)}</EmptyTitle>
          <EmptyDescription>{canReview ? t(K.emptyStaff) : t(K.emptyMember)}</EmptyDescription>
        </EmptyHeader>
        {canReview ? (
          <Button onClick={generate} disabled={actions.generate.isPending}>
            <RefreshCw
              aria-hidden="true"
              className={actions.generate.isPending ? 'animate-spin' : ''}
            />
            {actions.generate.isPending ? t(K.generating) : t(K.generate)}
          </Button>
        ) : null}
      </Empty>
    );
  }

  const weekLabel = (entry: ClientReportSummary) =>
    t(K.week, { since: entry.week.since, until: entry.week.until });

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center gap-2 px-[var(--card-pad)] pt-[var(--card-pad)]">
        <Select value={id ?? undefined} onValueChange={(value) => value && setSelected(value)}>
          <SelectTrigger className="w-64" aria-label={t(K.title)}>
            <SelectValue
              items={Object.fromEntries(reports.map((entry) => [entry.id, weekLabel(entry)]))}
            />
          </SelectTrigger>
          <SelectContent>
            {reports.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {weekLabel(entry)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {summary ? <StatusPill summary={summary} /> : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canReview ? (
            <Button
              variant="outline"
              size="sm"
              onClick={generate}
              disabled={actions.generate.isPending}
            >
              <RefreshCw
                aria-hidden="true"
                className={actions.generate.isPending ? 'animate-spin' : ''}
              />
              {actions.generate.isPending ? t(K.generating) : t(K.generate)}
            </Button>
          ) : null}
          {list.data?.can_set_targets && report ? (
            <Button variant="outline" size="sm" onClick={() => setTargetsOpen(true)}>
              <Target aria-hidden="true" />
              {t(K.setTargets)}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={!report}>
            <Download aria-hidden="true" />
            {t(K.pdf)}
          </Button>
          {canReview ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!detail.data}
              onClick={() =>
                detail.data &&
                void copy(
                  `${detail.data.draft.email.subject}\n\n${detail.data.draft.email.body}`,
                  t(K.emailCopied),
                  t(K.actionFailed),
                )
              }
            >
              <Mail aria-hidden="true" />
              {t(K.email)}
            </Button>
          ) : null}
          {canReview ? (
            <Button
              variant="outline"
              size="sm"
              onClick={share}
              disabled={!summary || actions.share.isPending}
            >
              <Link2 aria-hidden="true" />
              {t(K.share)}
            </Button>
          ) : null}
          {canReview && summary?.status === 'reviewed' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                actions.withdraw.mutate(summary.id, {
                  onSuccess: () => toast.success(t(K.withdrawn)),
                  onError: () => toast.error(t(K.actionFailed)),
                })
              }
              disabled={actions.withdraw.isPending}
            >
              <Undo2 aria-hidden="true" />
              {t(K.withdraw)}
            </Button>
          ) : null}
          {canReview && summary?.status === 'draft' ? (
            <Button
              size="sm"
              onClick={() =>
                actions.review.mutate(summary.id, { onError: () => toast.error(t(K.actionFailed)) })
              }
              disabled={actions.review.isPending}
            >
              <FileText aria-hidden="true" />
              {t(K.review)}
            </Button>
          ) : null}
        </div>
      </div>

      {detail.isLoading || !report ? (
        detail.isError ? (
          <p className="px-[var(--card-pad)] text-destructive text-sm">{t(K.loadFailed)}</p>
        ) : (
          <Skeleton className="mx-[var(--card-pad)] h-64 bg-muted/70" />
        )
      ) : (
        <>
          <div className="px-[var(--card-pad)]">
            <StaleSources report={report} />
          </div>
          <Panel
            title={t(K.title)}
            meta={weekLabel(summary as ClientReportSummary)}
            bodyClassName="p-0"
          >
            <MetricsTable report={report} />
          </Panel>
          <Panel title={t(K.changes)}>
            <Lines
              items={report.changes.map((change, index) => ({
                key: `${change.kind}-${index}`,
                strong: change.text,
                rest: change.impact,
              }))}
            />
          </Panel>
          <Panel title={t(K.recommendations)}>
            <Lines
              items={report.recommendations.map((rec, index) => ({
                key: `${rec.title}-${index}`,
                strong: `${rec.title}.`,
                rest: rec.text,
              }))}
            />
          </Panel>
          <Panel title={t(K.asks)}>
            <Lines
              items={report.client_asks.map((ask, index) => ({
                key: `${ask.text}-${index}`,
                strong: ask.text,
                rest: ask.reason,
              }))}
            />
          </Panel>
          <Panel title={t(K.method)}>
            <p className="text-sm">
              <span className="font-medium">{report.forecast_method.name}.</span>{' '}
              {report.forecast_method.description} {report.forecast_method.interval}
            </p>
          </Panel>
          <Panel title={t(K.sources)}>
            <ul className="flex flex-col gap-1 text-muted-foreground text-xs">
              {report.metrics.map((metric) => (
                <li key={metric.key}>
                  {t(METRIC_LABELS[metric.key])}: <code>{metric.source.tool}</code> ·{' '}
                  {metric.source.definition}
                </li>
              ))}
              {report.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </Panel>
          <TargetsDialog
            key={report.month}
            brandId={brandId}
            report={report}
            open={targetsOpen}
            onOpenChange={setTargetsOpen}
          />
        </>
      )}
    </div>
  );
}
