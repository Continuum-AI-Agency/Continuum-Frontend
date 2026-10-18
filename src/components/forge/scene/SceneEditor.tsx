'use client';

import {
  type BlendOutput,
  MAX_FRAMES,
  type SceneTemplateView,
  templateDisplayName,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clapperboard, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useReducer, useState } from 'react';
import { forgeDeepLinkHref } from '@/components/forge/forgeDeepLink';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchSceneTemplate, sceneProblem } from '@/lib/library/sceneTemplates';
import { fetchTemplateSources } from '@/lib/library/templateSources';
import { SceneInspector } from './SceneInspector';
import { ScenePreviewStage } from './ScenePreviewStage';
import { SceneRenderPanel } from './SceneRenderPanel';
import { initialSceneEditor, sceneEditorReducer } from './sceneEditorReducer';
import { useScenePreview } from './useScenePreview';
import { useSceneRenderJob } from './useSceneRenderJob';

// The Blender scene editor: the file's fields on the left, a draft of the picked camera in the
// middle, final renders on the right. It edits what one render will say, never the .blend itself.

type SceneMediaType = BlendOutput['mediaType'];

const sceneFrameCount = (output: BlendOutput) => output.frameEnd - output.frameStart + 1;

/**
 * What Render final makes until someone picks. The parse's type is a hint — a still often keeps
 * Blender's default frame range — so a range no render accepts defaults to a still.
 */
function defaultSceneMediaType(output: BlendOutput): SceneMediaType {
  const frames = sceneFrameCount(output);
  return frames <= 1 || frames > MAX_FRAMES ? 'image' : output.mediaType;
}

/** Still or animation for Render final. A one-frame output is a still and offers no choice. */
function SceneMediaTypePicker({
  output,
  value,
  onChange,
}: {
  output: BlendOutput;
  value: SceneMediaType;
  onChange: (next: SceneMediaType) => void;
}) {
  const frames = sceneFrameCount(output);
  if (frames <= 1) return null;
  const tooLong = frames > MAX_FRAMES;
  return (
    <RadioGroup
      aria-label="Render as"
      value={value}
      onValueChange={(next) => onChange(next as SceneMediaType)}
      className="flex w-auto flex-wrap items-center gap-x-3 gap-y-1"
    >
      <Label className="text-xs font-normal">
        <RadioGroupItem value="image" />
        {`Still · frame ${output.frameStart}`}
      </Label>
      <Label className="text-xs font-normal">
        <RadioGroupItem value="video" disabled={tooLong} />
        {`Animation · ${frames} frames`}
      </Label>
      {tooLong ? (
        <span className="text-2xs text-muted-foreground">
          {`Blender's range is ${frames} frames; renders take at most ${MAX_FRAMES}`}
        </span>
      ) : null}
    </RadioGroup>
  );
}

export function SceneEditor({ brandId, assetId }: { brandId: string; assetId: string }) {
  const queryClient = useQueryClient();
  const view = useQuery({
    queryKey: forgeQueryKeys.sceneTemplate(brandId, assetId),
    queryFn: ({ signal }) => fetchSceneTemplate(brandId, assetId, signal),
    staleTime: FORGE_STALE_MS.active,
  });
  // The name lives on the template source row, which the Forge gallery has usually cached already.
  const sources = useQuery({
    queryKey: forgeQueryKeys.templateSources(brandId),
    queryFn: () => fetchTemplateSources(brandId),
    staleTime: FORGE_STALE_MS.lists,
  });
  const source = sources.data?.find((candidate) => candidate.assetId === assetId);
  const name = source
    ? (source.displayName ?? templateDisplayName(source.parse?.filename))
    : 'Blender template';

  if (view.isPending) {
    return (
      <div
        role="status"
        aria-label="Reading the scene…"
        className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[18rem_minmax(0,1fr)_20rem]"
      >
        <Skeleton className="h-96 bg-muted/70" />
        <Skeleton className="h-96 bg-muted/70" />
        <Skeleton className="h-96 bg-muted/70" />
      </div>
    );
  }
  if (view.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-3 text-sm text-destructive">
        {sceneProblem(view.error).message}
        <Button size="sm" variant="outline" onClick={() => void view.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    // A newer version is a different set of fields: its edits start from its own defaults.
    <SceneEditorBody
      key={view.data.versionId}
      brandId={brandId}
      assetId={assetId}
      name={name}
      view={view.data}
      onReload={() =>
        void queryClient.invalidateQueries({
          queryKey: forgeQueryKeys.sceneTemplate(brandId, assetId),
        })
      }
    />
  );
}

function SceneEditorBody({
  brandId,
  assetId,
  name,
  view,
  onReload,
}: {
  brandId: string;
  assetId: string;
  name: string;
  view: SceneTemplateView;
  onReload: () => void;
}) {
  const [state, dispatch] = useReducer(sceneEditorReducer, view, initialSceneEditor);
  const output = view.outputs.find((candidate) => candidate.id === state.outputId) ?? null;
  // Cleared whenever the output changes, so each output starts from its own default.
  const [pickedMediaType, setPickedMediaType] = useState<SceneMediaType | null>(null);
  const mediaType = output ? (pickedMediaType ?? defaultSceneMediaType(output)) : null;
  const cameras = useMemo(() => new Set(view.outputs.map((entry) => entry.camera)), [view.outputs]);
  const preview = useScenePreview({
    brandId,
    assetId,
    versionId: view.versionId,
    outputId: output?.id ?? null,
    values: state.changes,
  });
  const render = useSceneRenderJob(brandId, assetId);
  const changed = Object.keys(state.changes).length;
  const stale = [preview.error, render.error].some(
    (error) => error && sceneProblem(error).code === 'scene_version_stale',
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={forgeDeepLinkHref({ templateAssetId: assetId, renderSetId: null, rowId: null })}
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'gap-1' })}
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Template
          </Link>
          <h1 className="min-w-0 truncate text-base font-semibold">{name}</h1>
          <Badge variant={changed ? 'violet' : 'muted'} className="text-2xs">
            {changed ? `${changed} changed` : 'As in the file'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Undo"
            disabled={!state.past.length}
            onClick={() => dispatch({ type: 'undo' })}
          >
            <Undo2 aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Redo"
            disabled={!state.future.length}
            onClick={() => dispatch({ type: 'redo' })}
          >
            <Redo2 aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={!changed}
            onClick={() => dispatch({ type: 'resetAll' })}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
          {output && mediaType ? (
            <SceneMediaTypePicker output={output} value={mediaType} onChange={setPickedMediaType} />
          ) : null}
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!output || render.starting}
            onClick={() =>
              output &&
              mediaType &&
              render.start({
                versionId: view.versionId,
                outputId: output.id,
                values: state.changes,
                overrides: { mediaType },
              })
            }
          >
            <Clapperboard className="size-3.5" aria-hidden />
            {render.starting ? 'Starting…' : 'Render final'}
          </Button>
        </div>
      </header>
      {stale ? (
        <p
          role="alert"
          className="m-0 flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs text-destructive"
        >
          Someone saved a newer version of this file. Load it to keep editing; your changes here
          start over.
          <Button size="xs" variant="outline" onClick={onReload}>
            Load newest
          </Button>
        </p>
      ) : null}
      {view.externals.length ? (
        <p className="m-0 shrink-0 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          This file points at {view.externals.length} file(s) it does not carry (
          {view.externals.map((external) => external.path).join(', ')}); they render missing. Pack
          them in Blender (File › External Data › Pack Resources).
        </p>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[18rem_minmax(0,1fr)_20rem] lg:overflow-hidden">
        <aside
          aria-label="Fields"
          className="min-h-0 overflow-y-auto border-b border-border lg:border-r lg:border-b-0"
        >
          <SceneInspector
            brandId={brandId}
            fields={view.fields}
            camera={output?.camera ?? null}
            cameras={cameras}
            changes={state.changes}
            selectedKey={state.selectedKey}
            onSelect={(key) => dispatch({ type: 'select', key })}
            onChange={(key, value) => dispatch({ type: 'set', key, value })}
            onReset={(key) => dispatch({ type: 'resetField', key })}
          />
        </aside>
        <main className="min-h-0 min-w-0 overflow-y-auto p-3">
          <ScenePreviewStage
            outputs={view.outputs}
            outputId={output?.id ?? null}
            onOutputChange={(outputId) => {
              if (outputId !== state.outputId) setPickedMediaType(null);
              dispatch({ type: 'chooseOutput', outputId });
            }}
            preview={preview}
          />
        </main>
        <aside
          aria-label="Final renders"
          className="min-h-0 overflow-y-auto border-t border-border lg:border-t-0 lg:border-l"
        >
          <SceneRenderPanel
            brandId={brandId}
            assetId={assetId}
            outputs={view.outputs}
            job={render.job}
            jobOutputId={render.jobOutputId}
            jobMediaType={render.jobMediaType}
            error={render.error}
          />
        </aside>
      </div>
    </div>
  );
}
