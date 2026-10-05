'use client';

import type { VideoEditorPoolAsset } from '@continuum/contracts';
import { RefreshCw, Workflow } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { libraryVersionKey } from '@/StudioCanvas/nodes/timeline/useClipPreviewUrls';
import type { VideoStudioContext } from '../types';
import { POOL_CHANGED_EVENT, PoolAssetCard } from './PoolAssetCard';

const SECTIONS: ReadonlyArray<{ origin: VideoEditorPoolAsset['origin']; title: string }> = [
  { origin: 'graph', title: 'On the canvas' },
  { origin: 'generated', title: 'Generated' },
  { origin: 'project', title: 'In this edit' },
];

/**
 * Everything this edit can draw from (`get_pool`): media wired into its node on the canvas,
 * what it generated, and what its clips already play. Refetched on every committed revision
 * and whenever a generation lands.
 */
export function useEditorPool(studio: VideoStudioContext) {
  const [assets, setAssets] = useState<VideoEditorPoolAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // The workspace may hand a fresh runOp every render; the pool must not refetch for that.
  const runOp = useRef(studio.runOp);
  runOp.current = studio.runOp;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAssets((await runOp.current('get_pool', {})).assets);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the media pool.');
    } finally {
      setLoading(false);
    }
  }, []);

  const { revision } = studio.project;
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision is the intended trigger — every committed edit can change which assets the clips play.
  useEffect(() => {
    void load();
  }, [load, revision]);

  useEffect(() => {
    const onChanged = () => void load();
    window.addEventListener(POOL_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(POOL_CHANGED_EVENT, onChanged);
  }, [load]);

  return { assets, error, loading, reload: load };
}

// Media wired into this edit on the canvas graph (left dock, Graph tab).
export function GraphPoolPanel({ studio }: { studio: VideoStudioContext }): React.ReactNode {
  const { assets, error, loading, reload } = useEditorPool(studio);

  return (
    <div className="flex flex-col gap-3 p-2" data-testid="graph-pool-panel">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-2xs text-muted-foreground">
          {assets ? `${assets.length} source${assets.length === 1 ? '' : 's'}` : 'Media pool'}
        </p>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label="Refresh the media pool"
                disabled={loading}
                onClick={() => void reload()}
              />
            }
          >
            {loading ? <Spinner className="size-3" /> : <RefreshCw className="size-3" />}
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/30 p-2 text-2xs text-destructive">
          {error}
        </p>
      ) : null}
      {assets && assets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-4 text-center">
          <Workflow className="size-5 text-muted-foreground" />
          <p className="text-2xs text-muted-foreground">
            Nothing feeds this edit yet. Wire media into the Video Editor node's media input on the
            canvas, or make something in Generate.
          </p>
        </div>
      ) : null}
      {SECTIONS.map(({ origin, title }) => {
        const section = (assets ?? []).filter((asset) => asset.origin === origin);
        if (section.length === 0) return null;
        return (
          <section key={origin} className="space-y-1.5" data-pool-section={origin}>
            <h3 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              {title}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {section.map((asset) => (
                <PoolAssetCard
                  key={libraryVersionKey(asset.assetId, asset.versionId ?? '')}
                  asset={asset}
                  studio={studio}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
