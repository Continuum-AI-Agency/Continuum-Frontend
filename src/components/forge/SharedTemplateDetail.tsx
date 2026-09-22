'use client';

import { type ApiRenderVariable, templateDisplayName } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  CircleDot,
  Loader2,
  Play,
  RectangleHorizontal,
  Variable,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { FactList } from '@/components/forge/FactList';
import { FormatPreview, previewFormats } from '@/components/forge/FormatPreview';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { RatioGlyph } from '@/components/forge/RatioGlyph';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { TemplateRenders } from '@/components/forge/TemplateRenders';
import { Pill } from '@/components/kibo-ui/pill';
import { Panel } from '@/components/shared/Panel';
import { Button } from '@/components/ui/button';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { type SharedTemplate, TemplateStatusPill } from './TemplateCard';
import { templateFrameQuery, useLatestRenderFrame } from './TemplateWireframe';

// A template shared into this brand, opened. Read-only: it has no Library source here, so there is
// nothing of its build to edit — only what it asks for (its contract), the shapes it renders, and
// what it has rendered for this brand.

const KIND_LABEL: Record<ApiRenderVariable['kind'], string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'On / off',
  image: 'Picture',
  video: 'Video',
  enum: 'Choice',
  color: 'Colour',
};

export function SharedTemplateDetail({
  brandId,
  brandName,
  template,
  busy,
  onBack,
  onToggle,
  onOpenRender,
}: {
  brandId: string;
  brandName?: string;
  template: SharedTemplate;
  busy: boolean;
  onBack: () => void;
  onToggle: () => void;
  onOpenRender?: (intent: ForgeRenderIntent) => void;
}) {
  const { templateKey, workspaceId } = template;
  const name = template.displayName ?? templateDisplayName(template.name);
  const brand = brandName ?? 'this brand';
  const contract = useQuery({
    queryKey: forgeQueryKeys.contract(brandId, workspaceId, templateKey),
    queryFn: () => apiRendersApi.getContract(brandId, templateKey, workspaceId),
    staleTime: FORGE_STALE_MS.contract,
    retry: false,
  });
  const formats = useMemo(
    () =>
      previewFormats({
        outputs: contract.data?.outputs,
        ratios: contract.data?.template.ratios,
      }),
    [contract.data],
  );
  const [formatId, setFormatId] = useState<string | undefined>(undefined);
  const format = formats.find((entry) => entry.id === formatId) ?? formats[0];
  const rendered = useLatestRenderFrame(brandId, templateKey, formats, format?.id);
  const { data: recent } = useQuery(templateFrameQuery(brandId, templateKey));
  const renderedJob = rendered
    ? recent?.items.find((job) => job.outputs.some((output) => output.url === rendered.url))
    : undefined;
  // Reserved variables are filled by the server; nobody sets them, so they are not listed.
  const variables = contract.data?.variables.filter((variable) => !variable.reserved) ?? [];
  const ratios = contract.data?.template.ratios ?? [];

  return (
    <div className="flex flex-col divide-y divide-border">
      <header className="flex flex-wrap items-center justify-between gap-2 px-[var(--card-pad)] py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden />
            Templates
          </Button>
          <h2 className="min-w-0 truncate text-base font-semibold">{name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            Shared with you{template.granted ? ` · in ${brand}` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            aria-label={template.granted ? `Remove ${name} from ${brand}` : `Use in ${brand}`}
            disabled={busy}
            onClick={onToggle}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {template.granted ? 'Remove' : `Use in ${brand}`}
          </Button>
          {template.granted && !template.draft && onOpenRender ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenRender({ templateKey })}
            >
              <Play className="size-3.5" aria-hidden />
              Render with this
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid divide-y divide-border lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:divide-x lg:divide-y-0">
        <div className="flex min-w-0 flex-col gap-2 p-[var(--card-pad)]">
          {format ? (
            <FormatPreview
              label="Template preview"
              formats={formats}
              value={format.id}
              onValueChange={setFormatId}
              wellClassName="h-[min(60vh,40rem)]"
              frame={(picked) =>
                rendered && renderedJob
                  ? {
                      mode: 'rendered',
                      at: renderedJob.finishedAt ?? renderedJob.updatedAt,
                      node:
                        rendered.kind === 'video' ? (
                          // biome-ignore lint/a11y/useMediaCaption: a silent preview frame has no captions to show
                          <video
                            src={`${rendered.url}#t=0.1`}
                            className="size-full object-contain"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          // biome-ignore lint/performance/noImgElement: a signed render URL, not a Next-optimisable asset
                          <img
                            src={rendered.url}
                            alt={`${name} · ${picked.ratio ?? picked.label}`}
                            className="size-full object-contain"
                          />
                        ),
                      caption: rendered.fileName,
                    }
                  : { mode: 'none', message: 'No render of this format yet' }
              }
            />
          ) : (
            <div className="flex h-[min(60vh,40rem)] items-center justify-center bg-muted/40 text-xs text-muted-foreground">
              {contract.isPending ? 'Reading the template…' : 'No formats listed for this template'}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col divide-y divide-border">
          <FactList
            className="p-[var(--card-pad)]"
            facts={[
              {
                icon: CircleDot,
                label: 'Status',
                value: <TemplateStatusPill status={template.draft ? 'draft' : 'ready'} />,
              },
              {
                icon: RectangleHorizontal,
                label: 'Formats',
                value: ratios.length ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {ratios.map((ratio) => (
                      <span
                        key={ratio}
                        className="inline-flex items-center gap-1 font-mono tabular-nums"
                      >
                        <RatioGlyph ratio={ratio} className="text-muted-foreground" />
                        {ratio}
                      </span>
                    ))}
                  </span>
                ) : (
                  '—'
                ),
              },
              {
                icon: Variable,
                label: 'Variables',
                numeric: true,
                value: contract.data ? variables.length : '…',
              },
              {
                icon: CalendarClock,
                label: 'Updated',
                value: template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : '—',
              },
            ]}
          />

          <Panel title="Variables" bodyClassName="p-0">
            {contract.isPending ? (
              <p className="p-[var(--card-pad)] text-xs text-muted-foreground">
                Reading what this template asks for…
              </p>
            ) : contract.isError ? (
              <p role="alert" className="p-[var(--card-pad)] text-xs text-destructive">
                Could not read this template:{' '}
                {contract.error instanceof Error ? contract.error.message : 'unknown error'}
              </p>
            ) : variables.length === 0 ? (
              <p className="p-[var(--card-pad)] text-xs text-muted-foreground">
                This template takes no variables.
              </p>
            ) : (
              <ul aria-label="Variables" className="flex flex-col divide-y divide-border text-xs">
                {variables.map((variable) => (
                  <li
                    key={variable.key}
                    className="flex flex-col gap-0.5 px-[var(--card-pad)] py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{variable.label}</span>
                      <span className="text-muted-foreground">{KIND_LABEL[variable.kind]}</span>
                      {variable.required ? <Pill variant="warning">Required</Pill> : null}
                    </div>
                    {variable.options.length ? (
                      <p className="text-muted-foreground">One of: {variable.options.join(', ')}</p>
                    ) : null}
                    {variable.description ? (
                      <p className="text-muted-foreground">{variable.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <TemplateRenders brandId={brandId} templateKey={templateKey} formats={formats} />
    </div>
  );
}
