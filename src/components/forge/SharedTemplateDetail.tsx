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
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { FactList } from '@/components/forge/FactList';
import { FormatPreview, previewFormats } from '@/components/forge/FormatPreview';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { RatioGlyph } from '@/components/forge/RatioGlyph';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { fullSrc, OutputFile } from '@/components/forge/renderOutputMedia';
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

export const KIND_LABEL: Record<ApiRenderVariable['kind'], string> = {
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
  onOpenSource,
  onOpenRender,
}: {
  brandId: string;
  brandName?: string;
  template: SharedTemplate;
  busy: boolean;
  onBack: () => void;
  onToggle: () => void;
  onOpenSource?: () => void;
  onOpenRender?: (intent: ForgeRenderIntent) => void;
}) {
  const translateUi = useUiTranslations('forge');
  const displayLocale = useUiLocale();

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
            <ArrowLeft className="size-3.5" aria-hidden /> {translateUi('templates_56b564b7')}{' '}
          </Button>
          <h2 className="min-w-0 truncate text-base font-semibold">{name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {template.sourceAssetId
              ? translateUi('built_from_your_library_f6dff8e3')
              : translateUi('shared_with_you_b447129c')}
            {template.granted ? translateUi('in_value0_76a5c23c', { value0: String(brand) }) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenSource ? (
            <Button type="button" size="sm" variant="outline" onClick={onOpenSource}>
              {translateUi('edit_source_4314a941')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            aria-label={
              template.granted
                ? translateUi('remove_value0_from_value1_a5b978b5', {
                    value0: String(name),
                    value1: String(brand),
                  })
                : translateUi('use_in_value0_54e69fc0', { value0: String(brand) })
            }
            disabled={busy}
            onClick={onToggle}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {template.granted
              ? translateUi('remove_c3812fc4')
              : translateUi('use_in_value0_54e69fc0', { value0: String(brand) })}
          </Button>
          {template.granted && !template.draft && onOpenRender ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenRender({ templateKey })}
            >
              <Play className="size-3.5" aria-hidden /> {translateUi(
                'render_with_this_c249855a',
              )}{' '}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid divide-y divide-border lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:divide-x lg:divide-y-0">
        <div className="flex min-w-0 flex-col gap-2 p-[var(--card-pad)]">
          {format ? (
            <FormatPreview
              label={translateUi('template_preview_df89bd92')}
              formats={formats}
              value={format.id}
              onValueChange={setFormatId}
              wellClassName="h-[min(60vh,40rem)]"
              frame={(picked) =>
                rendered && renderedJob
                  ? {
                      mode: 'rendered',
                      at: renderedJob.finishedAt ?? renderedJob.updatedAt,
                      node: (
                        <OutputFile
                          key={fullSrc(rendered)}
                          output={rendered}
                          alt={`${name} · ${picked.ratio ?? picked.label}`}
                          muted
                        />
                      ),
                      caption: rendered.fileName,
                    }
                  : { mode: 'none', message: translateUi('no_render_of_this_format_yet_fb756c80') }
              }
            />
          ) : (
            <div className="flex h-[min(60vh,40rem)] items-center justify-center bg-muted/40 text-xs text-muted-foreground">
              {contract.isPending
                ? translateUi('reading_the_template_78340ff8')
                : translateUi('no_formats_listed_for_this_template_2c6f6f47')}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col divide-y divide-border">
          <FactList
            className="p-[var(--card-pad)]"
            facts={[
              {
                icon: CircleDot,
                label: translateUi('status_920e413c'),
                value: <TemplateStatusPill status={template.draft ? 'draft' : 'ready'} />,
              },
              {
                icon: RectangleHorizontal,
                label: translateUi('formats_9f01769a'),
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
                label: translateUi('variables_02db55ba'),
                numeric: true,
                value: contract.data ? variables.length : '…',
              },
              {
                icon: CalendarClock,
                label: translateUi('updated_3a5ecca1'),
                value: template.updatedAt
                  ? new Date(template.updatedAt).toLocaleDateString(displayLocale)
                  : '—',
              },
            ]}
          />

          <Panel title={translateUi('variables_02db55ba')} bodyClassName="p-0">
            {contract.isPending ? (
              <p className="p-[var(--card-pad)] text-xs text-muted-foreground">
                {' '}
                {translateUi('reading_what_this_template_asks_for_23027302')}{' '}
              </p>
            ) : contract.isError ? (
              <p role="alert" className="p-[var(--card-pad)] text-xs text-destructive">
                {' '}
                {translateUi('could_not_read_this_template_11971a82')}{' '}
                {contract.error instanceof Error
                  ? contract.error.message
                  : translateUi('unknown_error_3e4443e5')}
              </p>
            ) : variables.length === 0 ? (
              <p className="p-[var(--card-pad)] text-xs text-muted-foreground">
                {' '}
                {translateUi('this_template_takes_no_variables_d0f3d2e2')}{' '}
              </p>
            ) : (
              <ul
                aria-label={translateUi('variables_02db55ba')}
                className="flex flex-col divide-y divide-border text-xs"
              >
                {variables.map((variable) => (
                  <li
                    key={variable.key}
                    className="flex flex-col gap-0.5 px-[var(--card-pad)] py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{variable.label}</span>
                      <span className="text-muted-foreground">{KIND_LABEL[variable.kind]}</span>
                      {variable.required ? (
                        <Pill variant="warning">{translateUi('required_4850b174')}</Pill>
                      ) : null}
                    </div>
                    {variable.options.length ? (
                      <p className="text-muted-foreground">
                        {translateUi('one_of_35c3e6d3')} {variable.options.join(', ')}
                      </p>
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
