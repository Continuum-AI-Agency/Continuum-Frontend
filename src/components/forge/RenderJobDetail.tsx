'use client';

import {
  type ApiRenderJob,
  type ApiRenderOutput,
  isWebTemplateKey,
  matchOutputFormat,
  WEB_COMPONENT_BINDING_ID,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  CircleDot,
  Cpu,
  Download,
  ExternalLink,
  FileDigit,
  Layers,
  Loader2,
  RectangleHorizontal,
  RefreshCw,
  Timer,
} from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import React, { useEffect, useRef, useState } from 'react';
import { type CheckRow, CheckTable } from '@/components/forge/CheckTable';
import { DeliveryChain } from '@/components/forge/DeliveryChain';
import { FactList } from '@/components/forge/FactList';
import {
  FormatPreview,
  type PreviewFormat,
  playableFirst,
  previewFormats,
} from '@/components/forge/FormatPreview';
import { LibraryStateLine, useLibraryState } from '@/components/forge/libraryState';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { RatioGlyph } from '@/components/forge/RatioGlyph';
import { RenderFileSpecs } from '@/components/forge/RenderFileSpecs';
import { fullSrc, OutputFile } from '@/components/forge/renderOutputMedia';
import { templateVersionOf, templateVersionTitle } from '@/components/forge/templateVersion';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { getApiBaseUrl } from '@/lib/api/config';
import { fetchTemplateRevisionVariants } from '@/lib/library/templateSources';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { type ForgeCheckUi, formatDuration, renderJobChecks } from './renderJobChecks';

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
      ViewTransition?: React.ComponentType<{
        name?: string;
        children: React.ReactNode;
      }>;
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
  // A web component lives in no workspace: its contract is read the way the Render grid reads it.
  const web = isWebTemplateKey(templateKey);
  const { data: environments } = useQuery({
    queryKey: forgeQueryKeys.environments(brandId),
    queryFn: () => apiRendersApi.listEnvironments(brandId),
    staleTime: FORGE_STALE_MS.lists,
    retry: false,
    enabled: !web,
  });
  const environment =
    environments?.items.find((item) => item.workspace === job.environment) ??
    environments?.items.find((item) => item.isDefault);
  const bindingId = web
    ? WEB_COMPONENT_BINDING_ID
    : environment && !environment.isDefault
      ? environment.bindingId
      : null;
  const { data: contract } = useQuery({
    queryKey: forgeQueryKeys.contract(brandId, bindingId, templateKey),
    queryFn: () => apiRendersApi.getContract(brandId, templateKey, bindingId),
    enabled: web || environments !== undefined,
    staleTime: FORGE_STALE_MS.contract,
    retry: false,
  });
  const parse = queryClient
    .getQueryData<
      Array<{
        templateKey: string | null;
        parse: Parameters<typeof previewFormats>[0]['parse'];
      }>
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
  const translateUi = useUiTranslations('forge');

  return test ? (
    <Pill variant="muted" title={translateUi('a_proof_for_review_not_marked_ready_8985a405')}>
      {' '}
      {translateUi('proof_7fbb3ccf')}{' '}
    </Pill>
  ) : (
    <Pill variant="violet" title={translateUi('a_final_render_marked_ready_to_use__45181b08')}>
      {' '}
      {translateUi('final_f4ed8fa6')}{' '}
    </Pill>
  );
}

/**
 * Which renderer a job ran on, only when it was not plain After Effects: Continuum's New Renderer
 * rendered it, or handed it to After Effects with the reason it named on the pill, or it was a web
 * component rendered in the browser. Nothing for an ordinary After Effects job.
 */
export function RenderEnginePill({
  job,
}: {
  job: Partial<Pick<ApiRenderJob, 'engine' | 'engineFallback'>>;
}) {
  const translateUi = useUiTranslations('forge');

  if (job.engineFallback)
    return (
      <Pill
        variant="muted"
        title={translateUi('sent_to_after_effects_value0_f1a6022c', {
          value0: String(job.engineFallback),
        })}
      >
        {' '}
        {translateUi('new_renderer_after_effects_6fd456a6')}{' '}
      </Pill>
    );
  if (job.engine === 'web')
    return (
      <Pill variant="muted" title={translateUi('rendered_from_the_web_component_in__c088b463')}>
        {' '}
        {translateUi('web_29751047')}{' '}
      </Pill>
    );
  return job.engine === 'micro' ? (
    <Pill variant="muted" title={translateUi('rendered_by_continuum_s_new_rendere_3cf9d8d6')}>
      {' '}
      {translateUi('new_renderer_23459184')}{' '}
    </Pill>
  ) : null;
}

/** "Rev 2 · Sep 10", the short digest when the revision was not read back, else "Unrecorded". */
export function TemplateVersion({
  job,
}: {
  job: Pick<ApiRenderJob, 'templateSource' | 'templateVariant' | 'createdAt'> &
    Partial<Pick<ApiRenderJob, 'templateRevision' | 'brandId'>>;
}) {
  const translateUi = useUiTranslations('forge');
  const versionLocale = useUiLocale();

  if (job.templateRevision && job.brandId)
    return (
      <RevisionTemplateVersion
        job={{
          ...job,
          brandId: job.brandId,
          templateRevision: job.templateRevision,
        }}
      />
    );
  const view = templateVersionOf(job, versionLocale);
  if (view.state === 'unrecorded') {
    return (
      <span className="text-muted-foreground" title={templateVersionTitle(view, translateUi)}>
        {' '}
        {translateUi('unrecorded_8526102b')}{' '}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={templateVersionTitle(view, translateUi)}
    >
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

function RevisionTemplateVersion({
  job,
}: {
  job: Pick<ApiRenderJob, 'brandId' | 'templateRevision'>;
}) {
  const translateUi = useUiTranslations('forge');

  const pin = job.templateRevision!;
  const { data } = useQuery({
    queryKey: [...forgeQueryKeys.revisionVariants(job.brandId, pin.sourceAssetId), 'history'],
    queryFn: () => fetchTemplateRevisionVariants(job.brandId, pin.sourceAssetId, true),
    staleTime: FORGE_STALE_MS.lists,
  });
  const variant = data?.find((item) => item.variantId === pin.variantId);
  const revision = variant?.revisions.find((item) => item.id === pin.revisionId);
  return (
    <span
      className="tabular-nums"
      title={translateUi('immutable_template_revision_value0__7f98c86b', {
        value0: String(pin.revisionId),
        value1: String(pin.checksum),
      })}
    >
      {variant && revision
        ? translateUi('value0_revision_value1_b3f8983b', {
            value0: String(variant.name),
            value1: String(revision.number),
          })
        : translateUi('revision_value0_76f40621', {
            value0: String(pin.revisionId.slice(0, 8)),
          })}
    </span>
  );
}

const checkRows = (
  job: ApiRenderJob,
  labelByKey: Record<string, string>,
  ui: ForgeCheckUi,
): CheckRow[] =>
  renderJobChecks(job, labelByKey, Date.now(), ui).map(({ lines, ...check }) => ({
    ...check,
    detail:
      check.kind === 'delivery' ? (
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
  const currentUiLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');

  const { formats: templateFormats, labelByKey } = useJobFormats(job, givenFormats);
  const files = playableFirst(job.outputs);
  const matched = files.map((file) => ({
    file,
    format: matchOutputFormat(file.fileName, templateFormats),
  }));
  // A real file remains available even when the template cannot name its format.
  const formats: PreviewFormat[] = [
    ...templateFormats,
    ...matched
      .filter(({ format }) => format === null)
      .map(({ file }) => ({
        id: `file:${file.id}`,
        label: file.fileName,
        ratio: null,
        width: file.width,
        height: file.height,
      })),
  ];
  const filesFor = (formatId: string) =>
    matched
      .filter(({ file, format }) => (format?.id ?? `file:${file.id}`) === formatId)
      .map(({ file }) => file);
  const fileFor = (formatId: string) => filesFor(formatId)[0] ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<'mov' | 'mxf' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const value =
    formats.find((format) => format.id === picked)?.id ??
    formats.find((format) => filesFor(format.id).some((file) => file.assetId))?.id ??
    formats.find((format) => fileFor(format.id))?.id ??
    formats[0]?.id ??
    '';
  const name = job.label ?? job.labelPath.at(-1) ?? templateName;
  const current = filesFor(value);
  const source =
    current.find((file) => extOf(file.fileName) === 'mov') ??
    current.find((file) => extOf(file.fileName) === 'mxf') ??
    current.find((file) => extOf(file.fileName) === 'mp4');
  const missingMasters = (['mov', 'mxf'] as const).filter(
    (format) => !current.some((file) => extOf(file.fileName) === format),
  );
  const existingMxf = current.find((file) => extOf(file.fileName) === 'mxf');
  const prepareDownload = async (format: 'mov' | 'mxf', remaster = false) => {
    const selected = remaster ? existingMxf : source;
    if (!selected || preparing) return;
    setPreparing(format);
    setDownloadError(null);
    try {
      const { path } = await apiRendersApi.prepareMasterDownload(job.id, {
        brandId: job.brandId,
        outputId: selected.id,
        format,
        ...(remaster ? { remaster: true } : {}),
      });
      const deadline = Date.now() + 11 * 60_000;
      while (mounted.current && Date.now() < deadline) {
        const { status } = await apiRendersApi.masterDownloadStatus(path);
        if (status === 'ready') {
          if (mounted.current) window.location.assign(`${getApiBaseUrl()}${path}`);
          return;
        }
        if (status === 'failed')
          throw new Error(`${format.toUpperCase()} conversion failed. Try again.`);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (mounted.current)
        throw new Error(`${format.toUpperCase()} is taking too long. Try again.`);
    } catch (error) {
      if (mounted.current)
        setDownloadError(
          error instanceof Error ? error.message : 'Could not prepare this download.',
        );
    } finally {
      if (mounted.current) setPreparing(null);
    }
  };
  const rendered = formats.filter((format) => fileFor(format.id));
  const inLibrary = files.flatMap((output) =>
    output.assetId ? [{ fileName: output.fileName, assetId: output.assetId }] : [],
  );
  const libraryState = useLibraryState(
    job.brandId,
    inLibrary.map((output) => output.assetId),
  );

  return (
    <div className="flex flex-col divide-y divide-border">
      <div className="flex flex-wrap items-start gap-2 p-[var(--card-pad)]">
        <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden /> {translateUi('all_renders_91c99c5f')}{' '}
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {job.labelPath.length > 1 ? `${job.labelPath.slice(0, -1).join(' / ')} · ` : ''}
            {templateName}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onRefresh}>
          <RefreshCw className="size-3.5" aria-hidden /> {translateUi('refresh_0e916101')}{' '}
        </Button>
      </div>

      <div className="grid divide-y divide-border lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)] lg:divide-x lg:divide-y-0">
        <div className="flex min-w-0 flex-col gap-2 p-[var(--card-pad)]">
          <ViewTransition name={jobTransitionName(job.id)}>
            {formats.length ? (
              <FormatPreview
                label={translateUi('render_preview_4f59a6d1')}
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
                            key={fullSrc(output)}
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
                            ? translateUi('this_render_failed_6bacf186')
                            : job.status === 'finished'
                              ? matched.some(({ format }) => format === null)
                                ? translateUi('no_file_matched_this_format_select__817866c8')
                                : translateUi('this_job_did_not_render_this_format_ccf58536')
                              : translateUi('no_file_yet_6a338a59'),
                      };
                }}
              />
            ) : (
              <p className="m-0 text-xs text-muted-foreground">
                {job.status === 'failed'
                  ? translateUi('this_render_failed_6bacf186')
                  : translateUi('no_file_yet_6a338a59')}
              </p>
            )}
          </ViewTransition>
          <div className="flex flex-wrap gap-3 text-xs">
            {current.map((output) => {
              const type = extOf(output.fileName).toUpperCase() || translateUi('file_3b9c358f');
              return (
                <a
                  key={output.id}
                  href={output.libraryUrl ?? output.url}
                  download={output.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={output.fileName}
                  aria-label={translateUi('download_value0_0f5a93c3', {
                    value0: String(type),
                  })}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Download className="size-3" aria-hidden /> {type}
                </a>
              );
            })}
            {job.status === 'finished' && existingMxf ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-auto px-0 py-0 text-xs text-primary"
                disabled={preparing !== null}
                onClick={() => void prepareDownload('mxf', true)}
              >
                {preparing === 'mxf' ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-3" aria-hidden />
                )}{' '}
                {translateUi('remake_broadcast_mxf_427b5e40')}{' '}
              </Button>
            ) : null}
            {job.status === 'finished' &&
              source &&
              missingMasters.map((format) => (
                <button
                  key={format}
                  type="button"
                  disabled={preparing !== null}
                  onClick={() => void prepareDownload(format)}
                  aria-label={translateUi('generate_value0_download_1062ad9f', {
                    value0: String(format.toUpperCase()),
                  })}
                  className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
                >
                  {preparing === format ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : (
                    <Download className="size-3" aria-hidden />
                  )}
                  {preparing === format
                    ? translateUi('preparing_value0_17b89445', {
                        value0: String(format.toUpperCase()),
                      })
                    : translateUi('generate_value0_5e825d79', {
                        value0: String(format.toUpperCase()),
                      })}
                </button>
              ))}
            {job.slackDelivery?.permalink ? (
              <a
                href={job.slackDelivery.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden /> {translateUi(
                  'slack_post_c116aec0',
                )}{' '}
              </a>
            ) : null}
          </div>
          {job.status === 'finished'
            ? current
                .filter((file) => file.kind === 'video')
                .map((output) => (
                  <RenderFileSpecs
                    key={output.id}
                    brandId={job.brandId}
                    jobId={job.id}
                    output={output}
                  />
                ))
            : null}
          {job.status === 'finished' && existingMxf ? (
            <p className="m-0 text-xs text-muted-foreground">
              {' '}
              {translateUi('remake_preserves_the_picture_and_re_0547e5ae')}{' '}
            </p>
          ) : null}
          {job.status === 'finished' && source && missingMasters.length > 0 ? (
            <p className="m-0 text-2xs text-muted-foreground">
              {' '}
              {translateUi('generated_files_are_converted_from__59f10b2b')}{' '}
            </p>
          ) : null}
          {downloadError ? (
            <p role="alert" className="m-0 text-xs text-destructive">
              {downloadError}
            </p>
          ) : null}
          {/* Each file as the Library holds it: where its review stands, and its thread. */}
          {inLibrary.length ? (
            <ul
              aria-label={translateUi('in_the_library_55c9c6bf')}
              className="m-0 flex list-none flex-col gap-1 p-0"
            >
              {inLibrary.map((output) => (
                <li key={output.assetId} className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
                    {output.fileName}
                  </span>
                  <LibraryStateLine
                    brandId={job.brandId}
                    assetId={output.assetId}
                    state={libraryState.get(output.assetId)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col divide-y divide-border">
          <FactList
            className="p-[var(--card-pad)]"
            facts={[
              {
                icon: CircleDot,
                label: translateUi('status_920e413c'),
                value: (
                  <span className="inline-flex items-center gap-1.5">
                    {job.status}
                    {job.status === 'rendering' && typeof job.progressPct === 'number'
                      ? ` ${job.progressPct}%`
                      : ''}
                    <RenderModePill test={job.test} />
                    <RenderEnginePill job={job} />
                  </span>
                ),
              },
              // Never hidden: most jobs that ask for Continuum's New Renderer fall back today.
              ...(job.engineFallback
                ? [
                    {
                      icon: Cpu,
                      label: translateUi('renderer_9deb780b'),
                      value: (
                        <span className="break-words">
                          After Effects{' '}
                          <span className="text-muted-foreground">
                            {' '}
                            {translateUi('handed_over_by_continuum_s_new_rend_c36e04c3')}{' '}
                            {job.engineFallback}
                          </span>
                        </span>
                      ),
                    },
                  ]
                : []),
              {
                icon: CalendarClock,
                label: translateUi('requested_2d9e2828'),
                value: (
                  <span title={job.createdAt}>
                    {formatRelativeTime(job.createdAt, undefined, currentUiLocale)}
                  </span>
                ),
              },
              {
                icon: Timer,
                label: translateUi('time_to_recorded_completion_e305b125'),
                numeric: true,
                value: job.finishedAt
                  ? formatDuration(Date.parse(job.finishedAt) - Date.parse(job.createdAt))
                  : '—',
              },
              {
                icon: Layers,
                label: translateUi('set_b6f6f3ad'),
                value: setName,
              },
              {
                icon: FileDigit,
                label: translateUi('variant_revision_a5050560'),
                value: <TemplateVersion job={job} />,
              },
              {
                icon: RectangleHorizontal,
                label: translateUi('formats_9f01769a'),
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
          <CheckTable
            rows={checkRows(job, labelByKey, {
              t: translateUi,
              locale: currentUiLocale,
            })}
          />
        </div>
      </div>
    </div>
  );
}
