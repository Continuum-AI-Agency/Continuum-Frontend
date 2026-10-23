'use client';

import {
  type TemplateSourceSummary,
  templateDisplayName,
  WEB_COMPONENT_BINDING_ID,
  webTemplateKey,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Play, Trash2 } from 'lucide-react';
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
            <ArrowLeft className="size-3.5" aria-hidden />
            Templates
          </Button>
          <h2 className="min-w-0 text-base font-semibold">
            <InlineRename value={name} onRename={onRename} />
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            Web component
            {web
              ? ` · ${variables.length} fields · ${web.width}×${web.height} · ${web.durationSec} s`
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
            <Trash2 className="size-3.5" aria-hidden /> Remove
          </Button>
          {parsed ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenRender?.({ templateKey })}
            >
              <Play className="size-3.5" aria-hidden />
              Render with this
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
            ? 'Reading the component…'
            : source.parseError
              ? parseErrorSentence(source.parseError)
              : 'This web component could not be read.'}
        </p>
      ) : contract.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 p-[var(--card-pad)] text-sm text-destructive"
        >
          {contract.error instanceof Error
            ? contract.error.message
            : 'Could not read this component.'}
          <Button size="sm" variant="outline" onClick={() => void contract.refetch()}>
            Retry
          </Button>
        </div>
      ) : !contract.data ? (
        <p role="status" className="m-0 p-[var(--card-pad)] text-sm text-muted-foreground">
          Reading the component…
        </p>
      ) : (
        <div className="grid divide-y divide-border lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:divide-x lg:divide-y-0">
          <div className="min-w-0 p-[var(--card-pad)]">
            {web ? (
              <WebComponentPreview web={web} values={NO_VALUES} />
            ) : (
              <p role="alert" className="m-0 text-sm text-destructive">
                This template has no web component preview.
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4 p-[var(--card-pad)]">
            <section aria-label="Render columns" className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-medium">Render columns</h3>
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
                          One of: {variable.options.join(', ')}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-xs text-muted-foreground">
                  This component exposes no editable properties.
                </p>
              )}
            </section>
            {issues.length ? (
              <section aria-label="Issues" className="flex flex-col gap-2">
                <h3 className="m-0 text-sm font-medium">Issues</h3>
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
