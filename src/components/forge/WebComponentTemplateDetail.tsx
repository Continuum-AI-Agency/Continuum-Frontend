'use client';

import {
  type TemplateSourceSummary,
  templateDisplayName,
  WEB_COMPONENT_BINDING_ID,
  webTemplateKey,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Play, Trash2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { OpenInLibrary } from '@/components/forge/libraryState';
import { templateLoadQueries } from '@/components/forge/queryKeys';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { KIND_LABEL } from '@/components/forge/SharedTemplateDetail';
import { InlineRename } from '@/components/forge/TemplateCard';
import { WebComponentPreview } from '@/components/forge/WebComponentPreview';
import { Button } from '@/components/ui/button';
import { parseErrorSentence } from '@/lib/library/sceneTemplates';

// An imported web component's sheet: the component live at its own values, the render columns
// its contract offers, and the way into Render. Not TemplateDetail: that one reads the After
// Effects build (fonts, layers, mapping) on mount, none of which a web component has.

const NO_VALUES = {};

export function WebComponentTemplateDetail({
  brandId,
  source,
  onBack,
  onRename,
  onRemove,
  onOpenRender,
}: {
  brandId: string;
  source: TemplateSourceSummary;
  onBack: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
  onOpenRender?: (intent: ForgeRenderIntent) => void;
}) {
  const translateUi = useUiTranslations('forge');

  const { assetId } = source;
  const templateKey = webTemplateKey(assetId);
  const name = source.displayName ?? templateDisplayName(source.parse?.filename);
  const parsed = source.parseState === 'parsed';
  // The Render grid's own read (same key), so opening Render next lands on a cached contract.
  const contract = useQuery({
    ...templateLoadQueries(brandId, WEB_COMPONENT_BINDING_ID, templateKey).contract,
    enabled: parsed,
  });
  const web = contract.data?.web;
  const variables = contract.data?.variables ?? [];
  const issues = contract.data?.publishCheck?.issues ?? [];

  return (
    <div className="flex flex-col divide-y divide-border">
      <header className="flex flex-wrap items-center justify-between gap-2 px-[var(--card-pad)] py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden /> {translateUi('templates_56b564b7')}{' '}
          </Button>
          <h2 className="min-w-0 text-base font-semibold">
            <InlineRename value={name} onRename={onRename} />
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {' '}
            {translateUi('web_component_a1d3232a')}{' '}
            {web
              ? translateUi('value0_fields_value1_value2_value3__bbd18dc4', {
                  value0: String(variables.length),
                  value1: String(web.width),
                  value2: String(web.height),
                  value3: String(web.durationSec),
                })
              : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <OpenInLibrary brandId={brandId} assetId={assetId} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" aria-hidden /> {translateUi('remove_c3812fc4')}{' '}
          </Button>
          {parsed ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenRender?.({ templateKey })}
            >
              <Play className="size-3.5" aria-hidden /> {translateUi(
                'render_with_this_c249855a',
              )}{' '}
            </Button>
          ) : null}
        </div>
      </header>

      {!parsed ? (
        <p
          role={source.parseState === 'pending' ? 'status' : 'alert'}
          className="m-0 p-[var(--card-pad)] text-sm text-muted-foreground"
        >
          {source.parseState === 'pending'
            ? translateUi('reading_the_component_884bc9bf')
            : source.parseError
              ? parseErrorSentence(source.parseError)
              : translateUi('this_web_component_could_not_be_rea_00020011')}
        </p>
      ) : contract.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 p-[var(--card-pad)] text-sm text-destructive"
        >
          {contract.error instanceof Error
            ? contract.error.message
            : translateUi('could_not_read_this_component_f9e9c3f7')}
          <Button size="sm" variant="outline" onClick={() => void contract.refetch()}>
            {' '}
            {translateUi('retry_942087cc')}{' '}
          </Button>
        </div>
      ) : !contract.data ? (
        <p role="status" className="m-0 p-[var(--card-pad)] text-sm text-muted-foreground">
          {' '}
          {translateUi('reading_the_component_884bc9bf')}{' '}
        </p>
      ) : (
        <div className="grid divide-y divide-border lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:divide-x lg:divide-y-0">
          <div className="min-w-0 p-[var(--card-pad)]">
            {web ? (
              <WebComponentPreview web={web} values={NO_VALUES} />
            ) : (
              <p role="alert" className="m-0 text-sm text-destructive">
                {' '}
                {translateUi('this_template_has_no_web_component__a0ee94e5')}{' '}
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4 p-[var(--card-pad)]">
            <section
              aria-label={translateUi('render_columns_0dce36c1')}
              className="flex flex-col gap-2"
            >
              <h3 className="m-0 text-sm font-medium">{translateUi('render_columns_0dce36c1')}</h3>
              {variables.length ? (
                <ul className="m-0 flex list-none flex-col divide-y divide-border p-0 text-xs">
                  {variables.map((variable) => (
                    <li key={variable.key} className="flex flex-col gap-0.5 py-1.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{variable.label}</span>
                        <span className="text-muted-foreground">{KIND_LABEL[variable.kind]}</span>
                      </span>
                      {variable.options.length ? (
                        <span className="text-muted-foreground">
                          {' '}
                          {translateUi('one_of_35c3e6d3')} {variable.options.join(', ')}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-xs text-muted-foreground">
                  {' '}
                  {translateUi('this_component_exposes_no_editable__de15f509')}{' '}
                </p>
              )}
            </section>
            {issues.length ? (
              <section aria-label={translateUi('issues_666067dd')} className="flex flex-col gap-2">
                <h3 className="m-0 text-sm font-medium">{translateUi('issues_666067dd')}</h3>
                <ul className="m-0 list-disc pl-4 text-xs text-warning">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
