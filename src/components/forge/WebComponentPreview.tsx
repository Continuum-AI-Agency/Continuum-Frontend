'use client';

import type {
  ApiRenderInputValue,
  ApiRenderTemplateContract,
  WebComponentOverride,
} from '@continuum/contracts';
import { AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  applyPreviewOverrides,
  ForgePreviewBridge,
} from '@/lib/forge-web-components/previewBridge';

// An imported web component, live: its preview page in a scripts-only sandbox, driven over the
// bridge at a row's values. The frame is made per load rather than rendered: a bridge clears its
// frame when it closes, which on a shared element would wipe the next load (Strict Mode's second
// mount, or a contract re-read that re-signs the preview URL).

export type WebComponentContract = NonNullable<ApiRenderTemplateContract['web']>;

/** A row's values as node overrides, through the contract's key → node property map. Scalars only. */
export function webPreviewOverrides(
  web: WebComponentContract,
  values: Readonly<Record<string, ApiRenderInputValue>>,
): WebComponentOverride[] {
  return web.variables.flatMap(({ key, nodeId, property }) => {
    const value = values[key];
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? [{ nodeId, property, value }]
      : [];
  });
}

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function WebComponentPreview({
  web,
  values,
}: {
  web: WebComponentContract;
  values: Readonly<Record<string, ApiRenderInputValue>>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [bridge, setBridge] = useState<ForgePreviewBridge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeSec, setTimeSec] = useState(0);
  const timeRef = useRef(timeSec);
  timeRef.current = timeSec;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const frame = document.createElement('iframe');
    frame.title = 'Web component preview';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.className = 'absolute inset-0 size-full border-0 bg-[#0b0e13]';
    host.prepend(frame);
    const controller = new AbortController();
    const next = new ForgePreviewBridge(frame, undefined, (cause) => setError(cause.message));
    // Rejected when closed before it was ready; the load below reports its own failure.
    void next.ready.catch(() => undefined);
    setBridge(null);
    setError(null);
    fetch(web.previewUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`The preview could not be loaded (${response.status}).`);
        return response.text();
      })
      .then((html) => {
        next.load(html);
        return next.ready;
      })
      .then(() => {
        if (!controller.signal.aborted) setBridge(next);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(message(cause, 'The preview could not be loaded.'));
      });
    return () => {
      controller.abort();
      void next.dispose().finally(() => frame.remove());
    };
  }, [web.previewUrl]);

  useEffect(() => {
    const host = hostRef.current;
    if (!bridge || !host || typeof ResizeObserver === 'undefined') return;
    const resize = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      void bridge
        .request('resize', {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        })
        .catch((cause: unknown) => setError(message(cause, 'Could not resize the preview.')));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => observer.disconnect();
  }, [bridge]);

  // A new values object every grid render; only a change in what it overrides re-applies.
  const overridesKey = JSON.stringify(webPreviewOverrides(web, values));
  useEffect(() => {
    if (!bridge) return;
    void applyPreviewOverrides(bridge, JSON.parse(overridesKey) as WebComponentOverride[])
      .then(() => bridge.request('renderAt', { timeSec: timeRef.current }))
      .catch((cause: unknown) => setError(message(cause, 'Could not update the preview.')));
  }, [bridge, overridesKey]);

  const seek = (next: number) => {
    setTimeSec(next);
    void bridge
      ?.request('renderAt', { timeSec: next })
      .catch((cause: unknown) => setError(message(cause, 'Preview seek failed.')));
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div
        ref={hostRef}
        className="relative max-h-[60vh] w-full overflow-hidden rounded-md bg-[#0b0e13]"
        style={{ aspectRatio: `${web.width} / ${web.height}` }}
      >
        {!bridge && !error ? (
          <p
            role="status"
            className="pointer-events-none absolute inset-0 m-0 grid place-items-center text-xs text-muted-foreground"
          >
            Loading the preview…
          </p>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="absolute inset-x-3 top-3 flex items-start gap-2 rounded-md border border-destructive/50 bg-background p-2.5 text-xs text-destructive"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {error}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <input
          aria-label="Preview time"
          type="range"
          min={0}
          max={web.durationSec}
          step={1 / web.fps}
          value={timeSec}
          disabled={!bridge}
          onChange={(event) => seek(Number(event.target.value))}
          className="min-w-0 flex-1 accent-primary"
        />
        <span className="w-24 text-right font-mono text-2xs tabular-nums text-muted-foreground">
          {timeSec.toFixed(2)} / {web.durationSec.toFixed(2)} s
        </span>
      </div>
    </div>
  );
}
