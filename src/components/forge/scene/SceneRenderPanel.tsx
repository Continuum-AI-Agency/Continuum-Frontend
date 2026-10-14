'use client';

import type { BlendOutput, SceneRenderStatus } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { OpenInLibrary } from '@/components/forge/libraryState';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Video } from '@/components/ui/video';
import { signedAssetUrlQueryKey, signLibraryAsset } from '@/lib/ai-studio/elements';
import {
  isTerminalSceneRender,
  listSceneRenders,
  sceneErrorSentence,
  sceneProblem,
} from '@/lib/library/sceneTemplates';
import { formatRelativeTime } from '@/lib/time/relativeTime';

// Final renders of this template: the one just started, then the history. A finished render is a
// Library asset, so each one shows its file and links to where it is reviewed.

const SIGNED_URL_STALE_MS = 30 * 60_000;

type Tone = 'success' | 'error' | 'warning' | 'info';
const STATE_TONE: Record<string, Tone> = {
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
  superseded: 'warning',
};
const stateLabel = (state: string) =>
  isTerminalSceneRender(state) ? state[0]!.toUpperCase() + state.slice(1) : 'Rendering';

export function SceneRenderStatePill({ state }: { state: string }) {
  return (
    <Pill variant="outline" className="gap-1.5 text-2xs" title={`Render ${state}`}>
      <PillIndicator variant={STATE_TONE[state] ?? 'info'} pulse={!isTerminalSceneRender(state)} />
      {stateLabel(state)}
    </Pill>
  );
}

type SceneMediaProps = {
  brandId: string;
  pin: { assetId: string; versionId: string };
  mediaType: BlendOutput['mediaType'];
  label: string;
};

/** One finished output, signed for display at its exact version. `fill` sizes it to its frame. */
export function SceneSignedMedia({
  brandId,
  pin,
  mediaType,
  label,
  fill = false,
}: SceneMediaProps & { fill?: boolean }) {
  const signed = useQuery({
    queryKey: [...signedAssetUrlQueryKey(brandId, pin.assetId), pin.versionId],
    queryFn: () => signLibraryAsset(brandId, pin.assetId, pin.versionId),
    staleTime: SIGNED_URL_STALE_MS,
    retry: false,
  });
  if (!signed.data)
    return (
      <div className="flex aspect-video items-center justify-center rounded-md bg-muted/70 text-2xs text-muted-foreground">
        {signed.isError ? 'Could not load this file' : 'Loading…'}
      </div>
    );
  return mediaType === 'video' ? (
    <Video
      src={signed.data}
      className={fill ? 'size-full object-contain' : 'aspect-auto! rounded-md'}
    />
  ) : (
    // biome-ignore lint/performance/noImgElement: a signed Library render, not a Next-optimisable asset
    <img
      src={signed.data}
      alt={`Render of ${label}`}
      className={
        fill
          ? 'size-full object-contain'
          : 'w-full rounded-md border border-border bg-muted/40 object-contain'
      }
    />
  );
}

function SceneOutputMedia(props: SceneMediaProps) {
  const { brandId, pin } = props;
  return (
    <figure className="m-0 flex flex-col gap-1">
      <SceneSignedMedia {...props} />
      <figcaption className="text-xs">
        <OpenInLibrary brandId={brandId} assetId={pin.assetId} />
      </figcaption>
    </figure>
  );
}

function SceneRenderRow({
  brandId,
  render,
  outputs,
  at,
}: {
  brandId: string;
  render: SceneRenderStatus & { outputId?: string };
  outputs: readonly BlendOutput[];
  at?: string;
}) {
  const output = outputs.find((candidate) => candidate.id === render.outputId);
  const label = output?.label ?? render.outputId ?? 'Render';
  return (
    <li className="flex flex-col gap-1.5 border-b border-border py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium" title={label}>
          {label}
        </span>
        <SceneRenderStatePill state={render.state} />
      </div>
      {at ? <span className="text-2xs text-muted-foreground">{formatRelativeTime(at)}</span> : null}
      {render.error ? (
        <p className="m-0 text-xs text-destructive" title={render.error}>
          {sceneErrorSentence(render.error)}
        </p>
      ) : null}
      {render.state === 'completed'
        ? render.outputs.map((pin) => (
            <SceneOutputMedia
              key={pin.versionId}
              brandId={brandId}
              pin={pin}
              mediaType={output?.mediaType ?? 'image'}
              label={label}
            />
          ))
        : null}
    </li>
  );
}

/** Newest first. `exclude` keeps the job shown above it from appearing twice. */
export function SceneRenderHistory({
  brandId,
  assetId,
  outputs,
  exclude,
  limit,
}: {
  brandId: string;
  assetId: string;
  outputs: readonly BlendOutput[];
  exclude?: string | null;
  limit?: number;
}) {
  const history = useQuery({
    queryKey: forgeQueryKeys.sceneRenders(brandId, assetId),
    queryFn: ({ signal }) => listSceneRenders(brandId, assetId, signal),
    staleTime: FORGE_STALE_MS.active,
  });
  if (history.isPending)
    return <p className="m-0 text-xs text-muted-foreground">Loading renders…</p>;
  if (history.isError)
    return (
      <p role="alert" className="m-0 text-xs text-destructive">
        {sceneProblem(history.error).message}
      </p>
    );
  const renders = history.data.renders.filter((render) => render.jobId !== exclude).slice(0, limit);
  if (!renders.length)
    return (
      <p className="m-0 text-xs text-muted-foreground">
        {history.data.renders.length ? 'No earlier renders.' : 'No renders yet.'}
      </p>
    );
  return (
    <ul aria-label="Render history" className="m-0 flex list-none flex-col p-0">
      {renders.map((render) => (
        <SceneRenderRow
          key={render.jobId}
          brandId={brandId}
          render={render}
          outputs={outputs}
          at={render.createdAt}
        />
      ))}
    </ul>
  );
}

export function SceneRenderPanel({
  brandId,
  assetId,
  outputs,
  job,
  jobOutputId,
  error,
}: {
  brandId: string;
  assetId: string;
  outputs: readonly BlendOutput[];
  /** The render this editor started, while it runs and once it ends. */
  job: SceneRenderStatus | null;
  jobOutputId: string | null;
  error: unknown;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {error ? (
        <p role="alert" className="m-0 text-xs text-destructive">
          {sceneProblem(error).message}
        </p>
      ) : null}
      {job ? (
        <section aria-label="This render" className="flex flex-col gap-1">
          <h3 className="m-0 text-3xs font-medium uppercase tracking-wide text-muted-foreground">
            This render
          </h3>
          <ul className="m-0 list-none p-0">
            <SceneRenderRow
              brandId={brandId}
              render={{ ...job, outputId: jobOutputId ?? undefined }}
              outputs={outputs}
            />
          </ul>
        </section>
      ) : null}
      <section aria-label="Renders" className="flex flex-col gap-1">
        <h3 className="m-0 text-3xs font-medium uppercase tracking-wide text-muted-foreground">
          Renders
        </h3>
        <SceneRenderHistory
          brandId={brandId}
          assetId={assetId}
          outputs={outputs}
          exclude={job?.jobId}
        />
      </section>
    </div>
  );
}
