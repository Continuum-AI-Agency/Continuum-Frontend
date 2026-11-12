'use client';

import { type TemplateSourceSummary, templateDisplayName } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Box, Trash2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { OpenInLibrary } from '@/components/forge/libraryState';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { groupSceneFields, SCENE_GROUP_TITLES } from '@/components/forge/scene/SceneInspector';
import { ScenePreviewStage } from '@/components/forge/scene/ScenePreviewStage';
import { SceneRenderHistory, SceneSignedMedia } from '@/components/forge/scene/SceneRenderPanel';
import { useScenePreview } from '@/components/forge/scene/useScenePreview';
import { HouseScenePill, InlineRename } from '@/components/forge/TemplateCard';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  blendParseProblem,
  fetchSceneTemplate,
  listSceneRenders,
  sceneProblem,
} from '@/lib/library/sceneTemplates';

// A Blender template's sheet in the Forge gallery: each output's last final render (or, before
// there is one, a draft at the file's own values), which fields it offers, and its recent renders. Editing happens in the scene editor; this sheet
// only says what is there and opens it.

const NO_CHANGES = {};
const RECENT_RENDERS = 5;
/** A big scene has thousands of fields; the sheet names a few and the editor lists them all. */
const SUMMARY_NAMES = 12;

function fieldSummary(fields: readonly { name: string }[]) {
  const shown = fields
    .slice(0, SUMMARY_NAMES)
    .map((field) => field.name)
    .join(', ');
  const more = fields.length - SUMMARY_NAMES;
  return more > 0 ? `${shown} and ${more} more` : shown;
}

export function sceneEditorHref(assetId: string) {
  return `/forge/scene/${encodeURIComponent(assetId)}`;
}

export function SceneTemplateDetail({
  brandId,
  source,
  onBack,
  onRename,
  onRemove,
}: {
  brandId: string;
  source: TemplateSourceSummary;
  onBack: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const translateUi = useUiTranslations('forge');

  const { assetId } = source;
  const name = source.displayName ?? templateDisplayName(source.parse?.filename);
  const parsed = source.parseState === 'parsed';
  const view = useQuery({
    queryKey: forgeQueryKeys.sceneTemplate(brandId, assetId),
    queryFn: ({ signal }) => fetchSceneTemplate(brandId, assetId, signal),
    enabled: parsed,
    staleTime: FORGE_STALE_MS.active,
  });
  const [outputId, setOutputId] = useState<string | null>(null);
  const outputs = view.data?.outputs ?? [];
  const output = outputs.find((candidate) => candidate.id === outputId) ?? outputs[0] ?? null;
  // Same key as SceneRenderHistory below, so the list and the stage share one request.
  const history = useQuery({
    queryKey: forgeQueryKeys.sceneRenders(brandId, assetId),
    queryFn: ({ signal }) => listSceneRenders(brandId, assetId, signal),
    enabled: parsed,
    staleTime: FORGE_STALE_MS.active,
  });
  const latest = history.data?.renders.find(
    (render) => render.outputId === output?.id && render.state === 'completed' && render.outputs[0],
  );
  // A draft only when there is no final render to show: no Cloud Run render just for looking.
  const preview = useScenePreview({
    brandId,
    assetId,
    versionId: view.data?.versionId ?? null,
    outputId: !history.isPending && !latest ? (output?.id ?? null) : null,
    values: NO_CHANGES,
  });
  const cameras = useMemo(() => new Set(outputs.map((entry) => entry.camera)), [outputs]);
  const groups = view.data
    ? groupSceneFields(view.data.fields, output?.camera ?? null, cameras)
    : [];

  return (
    <div className="flex flex-col divide-y divide-border">
      <header className="flex flex-wrap items-center justify-between gap-2 px-[var(--card-pad)] py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden /> {translateUi('templates_56b564b7')}{' '}
          </Button>
          <h2 className="min-w-0 text-base font-semibold">
            {source.house ? name : <InlineRename value={name} onRename={onRename} />}
          </h2>
          {source.house ? <HouseScenePill /> : null}
          <p className="truncate text-xs text-muted-foreground">
            {' '}
            {translateUi('blender_scene_15f109bd')}{' '}
            {view.data
              ? translateUi('value0_fields_value1_outputs_e561e8d7', {
                  value0: String(view.data.fields.length),
                  value1: String(outputs.length),
                })
              : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* A house scene belongs to the house brand: nothing here to rename, remove or open. */}
          {source.house ? null : (
            <>
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
            </>
          )}
          {view.data ? (
            <Link
              href={sceneEditorHref(assetId)}
              className={buttonVariants({ size: 'sm', className: 'gap-1.5' })}
            >
              <Box className="size-3.5" aria-hidden /> {translateUi('open_editor_550697e0')}{' '}
            </Link>
          ) : null}
        </div>
      </header>

      {!parsed ? (
        <p
          role={source.parseState === 'pending' ? 'status' : 'alert'}
          className="m-0 p-[var(--card-pad)] text-sm text-muted-foreground"
        >
          {source.parseState !== 'pending'
            ? blendParseProblem(source.parseError)
            : translateUi('reading_the_blend_40f8b768')}
        </p>
      ) : view.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 p-[var(--card-pad)] text-sm text-destructive"
        >
          {sceneProblem(view.error).message}
          <Button size="sm" variant="outline" onClick={() => void view.refetch()}>
            {' '}
            {translateUi('retry_942087cc')}{' '}
          </Button>
        </div>
      ) : !view.data ? (
        <p role="status" className="m-0 p-[var(--card-pad)] text-sm text-muted-foreground">
          {' '}
          {translateUi('reading_the_scene_708494d1')}{' '}
        </p>
      ) : (
        <div className="grid divide-y divide-border lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:divide-x lg:divide-y-0">
          <div className="flex min-w-0 flex-col gap-2 p-[var(--card-pad)]">
            <ScenePreviewStage
              outputs={outputs}
              outputId={output?.id ?? null}
              onOutputChange={setOutputId}
              preview={preview}
              wellClassName="h-[min(60vh,40rem)]"
              final={
                latest && output
                  ? {
                      at: latest.createdAt,
                      node: (
                        <SceneSignedMedia
                          fill
                          brandId={brandId}
                          pin={latest.outputs[0]!}
                          mediaType={latest.mediaType}
                          label={output.label}
                        />
                      ),
                    }
                  : null
              }
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4 p-[var(--card-pad)]">
            <section aria-label={translateUi('fields_616f48c1')} className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-medium">{translateUi('fields_616f48c1')}</h3>
              {groups.length ? (
                <dl className="m-0 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                  {groups.map(({ group, fields }) => {
                    const summary = fieldSummary(fields);
                    return (
                      <div key={group} className="contents">
                        <dt className="text-muted-foreground">
                          {SCENE_GROUP_TITLES[group]} · {fields.length}
                        </dt>
                        <dd className="m-0 truncate" title={summary}>
                          {summary}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ) : (
                <p className="m-0 text-xs text-muted-foreground">
                  {translateUi('this_file_exposes_no_fields_29359480')}
                </p>
              )}
              {view.data.externals.length ? (
                <p className="m-0 text-xs text-destructive">
                  {' '}
                  {translateUi('missing_from_the_file_22ab4a66')}{' '}
                  {view.data.externals.map((x) => x.path).join(', ')}
                  {translateUi('pack_them_in_blender_before_renderi_5741fe2f')}{' '}
                </p>
              ) : null}
            </section>
            <section
              aria-label={translateUi('recent_renders_8fdf5d7c')}
              className="flex flex-col gap-2"
            >
              <h3 className="m-0 text-sm font-medium">{translateUi('recent_renders_8fdf5d7c')}</h3>
              <SceneRenderHistory
                brandId={brandId}
                assetId={assetId}
                outputs={outputs}
                limit={RECENT_RENDERS}
              />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
