'use client';

// An HTML5 bundle (banner, microsite) running interactively at a device size. The bundle is
// served file by file out of its stored ZIP from the Backend's bundle route, which puts every
// document in an opaque origin (CSP sandbox); the iframe is sandboxed the same way, never with
// allow-same-origin, so the bundle can run its scripts but can reach no one's cookies,
// storage or DOM — not the app's, not the API's.

import { ExternalLink, Monitor, RotateCcw, Smartphone, Tablet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const HTML_BUNDLE_PRESETS = {
  desktop: { label: 'Desktop', width: 1440, height: 900, Icon: Monitor },
  tablet: { label: 'Tablet', width: 820, height: 1180, Icon: Tablet },
  mobile: { label: 'Mobile', width: 390, height: 844, Icon: Smartphone },
} as const;
export type HtmlBundlePreset = keyof typeof HTML_BUNDLE_PRESETS;

export const HTML_BUNDLE_SANDBOX =
  'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock';

type Props = {
  entryUrl: string;
  label: string;
  onReload: () => void;
};

/** Shrinks a device-size frame to fit the stage; never enlarges it. */
function fitScale(stage: { width: number; height: number } | null, preset: HtmlBundlePreset) {
  if (!stage) return 1;
  const { width, height } = HTML_BUNDLE_PRESETS[preset];
  return Math.min(1, (stage.width - 32) / width, (stage.height - 32) / height);
}

export function HtmlBundleViewer({ entryUrl, label, onReload }: Props) {
  const [preset, setPreset] = useState<HtmlBundlePreset>('desktop');
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStage({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { width, height } = HTML_BUNDLE_PRESETS[preset];
  const scale = fitScale(stage, preset);

  return (
    <div data-testid="html-bundle-viewer" data-preset={preset} className="flex size-full flex-col">
      <div className="flex shrink-0 items-center justify-center gap-1 p-2">
        <div className="flex items-center gap-1 rounded-full border border-border bg-background/90 p-1 shadow-sm">
          {(Object.keys(HTML_BUNDLE_PRESETS) as HtmlBundlePreset[]).map((key) => {
            const { label: presetLabel, Icon } = HTML_BUNDLE_PRESETS[key];
            return (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={key === preset ? 'secondary' : 'ghost'}
                aria-pressed={key === preset}
                data-testid={`html-bundle-preset-${key}`}
                onClick={() => setPreset(key)}
              >
                <Icon className="size-4" />
                {presetLabel}
              </Button>
            );
          })}
          <Button type="button" size="sm" variant="ghost" onClick={onReload} aria-label="Reload">
            <RotateCcw className="size-4" />
          </Button>
          <a
            href={entryUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in a new tab"
            className={buttonVariants({ size: 'sm', variant: 'ghost' })}
          >
            <ExternalLink className="size-4" />
          </a>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {width} × {height}
        </span>
      </div>
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'absolute left-1/2 top-1/2 origin-center overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-border',
          )}
          style={{ width, height, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <iframe
            key={entryUrl}
            src={entryUrl}
            title={label}
            sandbox={HTML_BUNDLE_SANDBOX}
            referrerPolicy="no-referrer"
            data-testid="html-bundle-frame"
            className="size-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
