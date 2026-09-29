'use client';

import { useEffect, useRef, useState } from 'react';
import { getHyperframesRevision } from '@/lib/api/hyperframesAgent.client';

type PlayerInput = { html: string; width: number; height: number; aspectRatio: string };

export function HyperframesInteractivePlayer({ html, width, height, aspectRatio }: PlayerInput) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let player: HTMLElement | null = null;
    async function mount() {
      await import('@hyperframes/player');
      if (cancelled || !host.current) return;
      const runtimeScript = `<script src="${window.location.origin}/hyperframes-runtime-0.8.75.js"></script>`;
      const withRuntime = /<\/body>/i.test(html)
        ? html.replace(/<\/body>/i, `${runtimeScript}</body>`)
        : `${html}${runtimeScript}`;
      // ponytail: data URL keeps model-authored script on an opaque origin; move to an
      // isolated composition host if document size ever exceeds browser URL limits.
      const isolatedUrl = `data:text/html;charset=utf-8,${encodeURIComponent(withRuntime)}`;
      player = document.createElement('hyperframes-player');
      player.setAttribute('src', isolatedUrl);
      player.setAttribute('controls', '');
      player.setAttribute('width', String(width));
      player.setAttribute('height', String(height));
      player.setAttribute('aria-label', 'Interactive HyperFrames composition');
      player.style.cssText = `display:block;width:100%;aspect-ratio:${aspectRatio.replace(':', '/')}`;
      host.current.append(player);
    }
    void mount().catch((cause: unknown) => {
      if (!cancelled)
        setError(cause instanceof Error ? cause.message : 'Interactive preview failed.');
    });
    return () => {
      cancelled = true;
      player?.remove();
    };
  }, [aspectRatio, height, html, width]);

  return (
    <div ref={host} className="size-full">
      {error ? (
        <p role="alert" className="p-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function InteractiveHyperframesPreview({ runId }: { runId: string }) {
  const [composition, setComposition] = useState<PlayerInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const revision = await getHyperframesRevision(runId);
      const response = await fetch(revision.compositionUrl);
      if (!response.ok) throw new Error('Could not load the interactive composition.');
      let html = await response.text();
      for (const asset of revision.assets)
        html = html.replaceAll(`hf-asset://${asset.assetId}`, asset.url);
      if (html.includes('hf-asset://')) throw new Error('Composition has unresolved media.');
      if (!cancelled)
        setComposition({
          html,
          width: revision.revision.width,
          height: revision.revision.height,
          aspectRatio: revision.revision.aspectRatio,
        });
    })().catch((cause: unknown) => {
      if (!cancelled)
        setError(cause instanceof Error ? cause.message : 'Interactive preview failed.');
    });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (error)
    return (
      <p role="alert" className="p-3 text-xs text-destructive">
        {error}
      </p>
    );
  if (!composition)
    return <p className="p-3 text-xs text-muted-foreground">Loading interactive composition…</p>;
  return <HyperframesInteractivePlayer {...composition} />;
}
