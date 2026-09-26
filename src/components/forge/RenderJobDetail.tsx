'use client';

import { type ApiRenderJob, type ApiRenderOutput, matchOutputFormat } from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  CircleDot,
  Download,
  ExternalLink,
  FileDigit,
  Layers,
  RectangleHorizontal,
  RefreshCw,
  Timer,
} from 'lucide-react';
import React, { useState } from 'react';
import { formatRelativeTime } from '@/components/approvals/formatters';
import { type CheckRow, CheckTable } from '@/components/forge/CheckTable';
import { DeliveryChain } from '@/components/forge/DeliveryChain';
import { FactList } from '@/components/forge/FactList';
import {
  FormatPreview,
  type PreviewFormat,
  playableFirst,
  previewFormats,
} from '@/components/forge/FormatPreview';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { RatioGlyph } from '@/components/forge/RatioGlyph';
import { templateVersionOf, templateVersionTitle } from '@/components/forge/templateVersion';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { formatDuration, renderJobChecks } from './renderJobChecks';

export { jobSteps, verdictOf } from './renderJobChecks';

// One render, expanded from its row: its files per format, its facts, and the checks it went
// through — each saying what it looks at and what it found. The row's thumbnail and this preview
// share a ViewTransition name, so opening morphs one into the other; the caller skips the
// transition under prefers-reduced-motion.

// ViewTransition ships in the React canary Next bundles; stable @types/react lacks it — the same
// cast as OrganicWorkspaceTabs.tsx.
export const ViewTransition =
  (
    React as unknown as {
      ViewTransition?: React.ComponentType<{ name?: string; children: React.ReactNode }>;
    }
  ).ViewTransition ??
  function ViewTransitionFallback({ children }: { name?: string; children: React.ReactNode }) {
    return <>{children}</>;
  };

export const jobTransitionName = (jobId: string) => `forge-job-${jobId}`;

/**
 * The formats a job names by itself, with no read: the ratios its judge frames resolved, else the
 * comp its placement was measured in. What a ledger row's thumbnail picks its file with.
 */
// ponytail: a ledger row has no contract in hand; a per-job output-format snapshot retires this.
export function formatsNamedByJob(job: ApiRenderJob): PreviewFormat[] {
  const judged = [
    ...new Set((job.judge?.frames ?? []).flatMap((frame) => (frame.ratio ? [frame.ratio] : []))),
  ];
  if (judged.length) return previewFormats({ ratios: judged });
  const comp = job.fit?.comp;
  return comp
    ? [
        {
          id: comp.name,
          label: comp.name,
          ratio: null,
          comp,
          width: comp.width,
          height: comp.height,
        },
      ]
    : [];
}

/**
 * The formats this job's template renders, and which of its files each one is: the contract's
 * outputs, else the template's parse (when the gallery already holds it), else its ratio labels,
 * else the ratios the judge named. A file no format answers is shown under no format.
 */
function useJobFormats(job: ApiRenderJob, given: PreviewFormat[] | undefined) {
  const queryClient = useQueryClient();
  const { brandId, templateKey } = job;
  const { data: environments } = useQuery({
    queryKey: forgeQueryKeys.environments(brandId),
    queryFn: () => apiRendersApi.listEnvironments(brandId),
    staleTime: FORGE_STALE_MS.lists,
    retry: false,
  });
  const environment =
    environments?.items.find((item) => item.workspace === job.environment) ??
    environments?.items.find((item) => item.isDefault);
  const bindingId = environment && !environment.isDefault ? environment.bindingId : null;
  const { data: contract } = useQuery({
    queryKey: forgeQueryKeys.contract(brandId, bindingId, templateKey),
    queryFn: () => apiRendersApi.getContract(brandId, templateKey, bindingId),
    enabled: environments !== undefined,
    staleTime: FORGE_STALE_MS.contract,
    retry: false,
  });
  const parse = queryClient
    .getQueryData<
      Array<{ templateKey: string | null; parse: Parameters<typeof previewFormats>[0]['parse'] }>
    >(forgeQueryKeys.templateSources(brandId))
    ?.find((source) => source.templateKey === templateKey)?.parse;
  const fromTemplate = previewFormats({
    outputs: contract?.outputs,
    parse,
    ratios: contract?.template.ratios,
  });
  const formats = given ?? (fromTemplate.length ? fromTemplate : formatsNamedByJob(job));
  const labelByKey = Object.fromEntries(
    (contract?.variables ?? []).map((variable) => [variable.key, variable.label]),
  );
  return { formats, labelByKey };
}

const extOf = (fileName: string) => {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
};

/** "3 MP4 · 3 MOV · 3 MXF" — every file a job made, by type. */
export function filesSummary(outputs: readonly ApiRenderOutput[]): string {
  const counts = new Map<string, number>();
  for (const output of playableFirst(outputs)) {
    const type = extOf(output.fileName).toUpperCase() || 'FILE';
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts].map(([type, count]) => `${count} ${type}`).join(' · ');
}

/** Proof or Final — what the render was asked to be. Today both are the same pixels. */
export function RenderModePill({ test }: { test: boolean }) {
  return test ? (
    <Pill variant="muted" title="A proof, for review. Not marked ready to use.">
      Proof
    </Pill>
  ) : (
    <Pill variant="violet" title="A final render, marked ready to use by a brand owner or admin.">
      Final
    </Pill>
  );
}

/** "Rev 2 · Sep 10", the short digest when the revision was not read back, else "Unrecorded". */
export function TemplateVersion({
  job,
}: {
  job: Pick<ApiRenderJob, 'templateSource' | 'templateVariant' | 'createdAt'>;
}) {
  const view = templateVersionOf(job);
  if (view.state === 'unrecorded') {
    return (
      <span className="text-muted-foreground" title={templateVersionTitle(view)}>
        Unrecorded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" title={templateVersionTitle(view)}>
      <span className={view.label === view.short ? 'font-mono tabular-nums' : 'tabular-nums'}>
        {view.label}
      </span>
      {/* The variant, when the version tree named one. Silence here is UNCHECKED, not "only one
          variant exists" — so nothing is drawn rather than a reassuring default. */}
      {view.variant ? (
        <span className="font-mono text-2xs text-muted-foreground">{view.variant}</span>
      ) : null}
    </span>
  );
}

/**
 * Whether an image already failed to load when React attached to it. A transition (opening a job)
 * builds its elements before it commits them, so an expired link can fail in between and the error
 * event lands on nothing; this reads the failure off the element instead.
 */
export const imageFailed = (element: HTMLImageElement | null) =>
  element !== null && element.complete && element.naturalWidth === 0;

/** A file that will not load — an expired signed link, or a container the browser cannot play. */
function OutputFile({ output, alt }: { output: ApiRenderOutput; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <p className="m-0 flex size-full items-center justify-center bg-muted p-[var(--card-pad)] text-center text-xs text-muted-foreground">
        {output.kind === 'video'
          ? 'This browser can’t play this file. Download it below.'
          : 'This file can’t be shown — its link may have expired. Refresh to get a new one.'}
      </p>
    );
  }
  return output.kind === 'video' ? (
    // biome-ignore lint/a11y/useMediaCaption: renders carry no caption track.
    <video
      src={output.url}
      controls
      playsInline
      className="size-full object-contain"
      // The same race as `imageFailed`, read off the video's own error.
      ref={(element) => {
        if (element?.error) setBroken(true);
      }}
      onError={() => setBroken(true)}
    />
  ) : (
    // biome-ignore lint/performance/noImgElement: a signed render URL, not a Next-optimisable asset
    <img
      src={output.url}
      alt={alt}
      className="size-full object-contain"
      ref={(element) => {
        if (imageFailed(element)) setBroken(true);
      }}
      onError={() => setBroken(true)}
    />
  );
}

const checkRows = (job: ApiRenderJob, labelByKey: Record<string, string>): CheckRow[] =>
  renderJobChecks(job, labelByKey).map(({ lines, ...check }) => ({
    ...check,
    detail:
      check.name === 'Delivery' ? (
        <DeliveryChain job={job} wrap />
      ) : lines.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : undefined,
  }));

export function RenderJobDetail({
  job,
  templateName,
  setName,
  formats: givenFormats,
  onBack,
  onRefresh,
}: {
  job: ApiRenderJob;
  templateName: string;
  setName: string;
  /** The template's formats when the caller already knows them (template detail does). */
  formats?: PreviewFormat[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  const { formats: templateFormats, labelByKey } = useJobFormats(job, givenFormats);
  // ponytail: with no contract, parse or judged ratio to name them, each file is its own format
  // drawn from its stored size (square when the fleet stored none). Goes once contracts always load.
  const formats: PreviewFormat[] = templateFormats.length
    ? templateFormats
    : job.outputs.map((output) => ({
        id: output.id,
        label: output.fileName,
        ratio: null,
        width: output.width,
        height: output.height,
      }));
  const files = playableFirst(job.outputs);
  const filesFor = (formatId: string) =>
    files.filter((output) =>
      templateFormats.length
        ? matchOutputFormat(output.fileName, formats)?.id === formatId
        : output.id === formatId,
    );
  const fileFor = (formatId: string) => filesFor(formatId)[0] ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const value =
    formats.find((format) => format.id === picked)?.id ??
    formats.find((format) => fileFor(format.id))?.id ??
    formats[0]?.id ??
    '';
  const name = job.label ?? job.labelPath.at(-1) ?? templateName;
  const current = filesFor(value);
  const rendered = formats.filter((format) => fileFor(format.id));

  return (
    <div className="flex flex-col divide-y divide-border">
      <div className="flex flex-wrap items-start gap-2 p-[var(--card-pad)]">
        <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden /> All renders
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {job.labelPath.length > 1 ? `${job.labelPath.slice(0, -1).join(' / ')} · ` : ''}
            {templateName}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onRefresh}>
          <RefreshCw className="size-3.5" aria-hidden /> Refresh
        </Button>
      </div>

      <div className="grid divide-y divide-border lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)] lg:divide-x lg:divide-y-0">
        <div className="flex min-w-0 flex-col gap-2 p-[var(--card-pad)]">
          <ViewTransition name={jobTransitionName(job.id)}>
            {formats.length ? (
              <FormatPreview
                label="Render preview"
                formats={formats}
                value={value}
                onValueChange={setPicked}
                wellClassName="h-[min(60vh,40rem)]"
                frame={(format) => {
                  const output = fileFor(format.id);
                  return output
                    ? {
                        mode: 'rendered',
                        at: job.finishedAt ?? job.updatedAt,
                        node: (
                          <OutputFile
                            // By URL: a refresh that re-signs an expired link gets a fresh try.
                            key={output.url}
                            output={output}
                            alt={`${name} · ${format.ratio ?? format.label}`}
                          />
                        ),
                        caption: output.fileName,
                      }
                    : {
                        mode: 'none',
                        message:
                          job.status === 'failed'
                            ? 'This render failed.'
                            : job.status === 'finished'
                              ? 'No file for this format'
                              : 'No file yet.',
                      };
                }}
              />
            ) : (
              <p className="m-0 text-xs text-muted-foreground">
                {job.status === 'failed' ? 'This render failed.' : 'No file yet.'}
              </p>
            )}
          </ViewTransition>
          <div className="flex flex-wrap gap-3 text-xs">
            {current.map((output) => {
              const type = extOf(output.fileName).toUpperCase() || 'file';
              return (
                <a
                  key={output.id}
                  href={output.url}
                  download={output.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={output.fileName}
                  aria-label={`Download ${type}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Download className="size-3" aria-hidden /> {type}
                </a>
              );
            })}
            {job.slackDelivery?.permalink ? (
              <a
                href={job.slackDelivery.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden /> Slack post
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-col divide-y divide-border">
          <FactList
            className="p-[var(--card-pad)]"
            facts={[
              {
                icon: CircleDot,
                label: 'Status',
                value: (
                  <span className="inline-flex items-center gap-1.5">
                    {job.status}
                    {job.status === 'rendering' && typeof job.progressPct === 'number'
                      ? ` ${job.progressPct}%`
                      : ''}
                    <RenderModePill test={job.test} />
                  </span>
                ),
              },
              {
                icon: CalendarClock,
                label: 'Requested',
                value: <span title={job.createdAt}>{formatRelativeTime(job.createdAt)}</span>,
              },
              {
                icon: Timer,
                label: 'Duration',
                numeric: true,
                value: job.finishedAt
                  ? formatDuration(Date.parse(job.finishedAt) - Date.parse(job.createdAt))
                  : '—',
              },
              { icon: Layers, label: 'Set', value: setName },
              {
                icon: FileDigit,
                label: 'Template version',
                value: <TemplateVersion job={job} />,
              },
              {
                icon: RectangleHorizontal,
                label: 'Formats',
                value: rendered.length ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {rendered.map((format) => (
                      <span
                        key={format.id}
                        className="inline-flex items-center gap-1 font-mono tabular-nums"
                      >
                        <RatioGlyph ratio={format.ratio} className="text-muted-foreground" />
                        {format.ratio ?? format.label}
                      </span>
                    ))}
                  </span>
                ) : (
                  '—'
                ),
              },
            ]}
          />
          <CheckTable rows={checkRows(job, labelByKey)} />
        </div>
      </div>
    </div>
  );
}
