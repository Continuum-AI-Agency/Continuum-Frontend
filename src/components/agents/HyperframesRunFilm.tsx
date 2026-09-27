'use client';

import {
  type AgentRunEventDto,
  type HyperframesStoragePointer,
  hyperframesAgentEventSchema,
} from '@continuum/contracts';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useAgentRunStream } from '@/hooks/useAgentRunStream';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { signHyperframeAsset } from '@/lib/organic/hyperframeSign';

// A HyperFrames film asked for from another agent's chat (Jaina's ask_agent). The call
// detaches long before the render finishes, so the delegation frame stays `running`
// forever; the card follows the HyperFrames run's own durable event log instead. A
// reload replays that log, so nothing here depends on having watched the run live.

export type HyperframesFilm =
  | { state: 'running'; step: string | null }
  | { state: 'ready'; storage: HyperframesStoragePointer }
  | { state: 'failed'; error: string };

/** Fold a run's event log into what the card shows. The latest render wins. */
export function filmOf(events: readonly AgentRunEventDto[] | undefined): HyperframesFilm {
  let step: string | null = null;
  let storage: HyperframesStoragePointer | null = null;
  let error: string | null = null;
  for (const raw of events ?? []) {
    const parsed = hyperframesAgentEventSchema.safeParse(raw);
    if (!parsed.success) continue;
    const event = parsed.data;
    if (event.type === 'hyperframes.agent.step') step = event.data.message;
    else if (event.type === 'hyperframes.render.completed') storage = event.data.storage;
    else if (event.type === 'response.error') error = event.data.message;
    else if (event.type === 'response.cancelled') error = event.data.message ?? 'Cancelled.';
  }
  if (storage) return { state: 'ready', storage };
  if (error) return { state: 'failed', error };
  return { state: 'running', step };
}

/** Tail the run until it has a film or an error, then stop listening. */
export function useHyperframesFilm(runId: string | null): HyperframesFilm | null {
  const events = useAgentRunStore((state) => (runId ? state.runs[runId]?.events : undefined));
  const film = useMemo(() => (runId ? filmOf(events) : null), [runId, events]);
  useAgentRunStream(runId, 'hyperframes', film?.state === 'running');
  return film;
}

export function HyperframesFilmView({ film }: { film: HyperframesFilm }) {
  if (film.state === 'failed') {
    return <p className="text-xs text-destructive">{film.error}</p>;
  }
  if (film.state === 'running') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
        {film.step ?? 'Making the film…'}
      </p>
    );
  }
  return <SignedFilm storage={film.storage} />;
}

function SignedFilm({ storage }: { storage: HyperframesStoragePointer }) {
  const { activeBrandId } = useActiveBrandContext();
  const [url, setUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!activeBrandId) return;
    let live = true;
    void signHyperframeAsset({
      brandId: activeBrandId,
      bucket: storage.bucket,
      path: storage.path,
    }).then((signed) => {
      if (!live) return;
      setUrl(signed);
      setUnavailable(!signed);
    });
    return () => {
      live = false;
    };
  }, [activeBrandId, storage.bucket, storage.path]);

  if (unavailable) {
    return <p className="text-xs text-destructive">The film is ready but could not be loaded.</p>;
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-md border border-border/60 bg-black">
      {url ? (
        // biome-ignore lint/a11y/useMediaCaption: a generated report film has no caption track
        <video
          data-testid="hyperframes-film"
          src={url}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full"
        />
      ) : null}
    </div>
  );
}
