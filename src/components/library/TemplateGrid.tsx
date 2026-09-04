'use client';

import type { MediaAsset, TemplateSource } from '@continuum/contracts';
import { AlertTriangle, Clock3, Layers, Loader2, Send, Type } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TypefaceHoldBadge } from '@/components/brand/typefaceHonesty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  fetchTemplateFonts,
  sendTemplateToForge,
  type TemplateFontReadiness,
} from '@/lib/library/templateSources';
import { cn } from '@/lib/utils';

// The Templates section: the same rows the Library already holds, shown as what they ARE
// rather than as an opaque file card. A template's useful facts are its ratios, its slots and
// its fonts, and none of them are visible on a filename.

const GRID_CLASS =
  'grid grid-cols-1 gap-[var(--app-shell-gap)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

function PARSE_LABEL(state: TemplateSource['parseState']): {
  text: string;
  variant: 'muted' | 'success' | 'warning' | 'destructive';
} {
  switch (state) {
    case 'parsed':
      return { text: 'Read', variant: 'success' };
    case 'pending':
      return { text: 'Not read yet', variant: 'muted' };
    case 'unsupported':
      return { text: 'Not readable', variant: 'warning' };
    case 'failed':
      return { text: "Couldn't read", variant: 'destructive' };
  }
}

function TemplateCard({
  brandId,
  source,
  asset,
  onChanged,
}: {
  brandId: string;
  source: TemplateSource;
  asset: MediaAsset | undefined;
  onChanged: () => void;
}) {
  const [fonts, setFonts] = useState<TemplateFontReadiness | null>(null);
  const [sending, setSending] = useState(false);
  const parse = source.parse;
  const name = asset?.title ?? parse?.filename ?? asset?.fileName ?? source.assetId;
  const badge = PARSE_LABEL(source.parseState);

  useEffect(() => {
    if (source.parseState !== 'parsed' || source.fonts.length === 0) return;
    let cancelled = false;
    fetchTemplateFonts(brandId, source.assetId)
      .then((result) => {
        if (!cancelled) setFonts(result);
      })
      // Advisory: a template card is still useful without the readiness check, and a failed
      // check must not make a parsed template look broken.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [brandId, source.assetId, source.parseState, source.fonts.length]);

  const sendToForge = useCallback(async () => {
    setSending(true);
    try {
      const next = await sendTemplateToForge(brandId, source.assetId);
      toast.success(
        next.forgeState === 'stubbed'
          ? 'Recorded for Template Forge. The live hand-off is not switched on yet.'
          : 'Sent to Template Forge.',
      );
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reach Template Forge');
    } finally {
      setSending(false);
    }
  }, [brandId, source.assetId, onChanged]);

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border/60 bg-card p-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-medium" title={name}>
          {name}
        </span>
        <Badge variant={badge.variant}>{badge.text}</Badge>
      </div>

      {source.parseState === 'parsed' ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {source.ratios.map((ratio) => (
              <Badge key={ratio} variant="secondary" className="tabular-nums">
                {ratio}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="size-3.5" />
              {source.slotCount ?? 0} {source.slotCount === 1 ? 'slot' : 'slots'}
            </span>
            <span className="flex items-center gap-1">
              <Type className="size-3.5" />
              {source.fonts.length} {source.fonts.length === 1 ? 'font' : 'fonts'}
            </span>
            {parse?.comps.some((comp) => comp.durationSec) ? (
              <span className="flex items-center gap-1 tabular-nums">
                <Clock3 className="size-3.5" />
                {Math.round(
                  parse.comps.find((comp) => comp.isDelivery && comp.durationSec)?.durationSec ?? 0,
                )}
                s
              </span>
            ) : null}
          </div>

          {/* The check nothing did before: a template missing a font still renders, and hands
              back a frame in a fallback face that looks exactly like success. */}
          {fonts && fonts.missing > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {fonts.missing} of {fonts.fonts.length} fonts are not in the engine. Renders will
                fall back to another face.
              </span>
            </div>
          ) : null}
          {fonts ? (
            <div className="flex flex-col gap-1">
              {fonts.fonts.map((font) => (
                <div key={font.family} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-muted-foreground">{font.family}</span>
                  <TypefaceHoldBadge held={font.held} />
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {source.parseState === 'failed'
            ? (source.parseError ?? 'This file could not be read.')
            : 'Uploaded. Nothing has opened this file yet, so it has no ratios or slots to show.'}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="truncate text-2xs text-muted-foreground">
          {source.templateKey ? (
            <>Published as {source.templateKey}</>
          ) : source.forgeRunId ? (
            // Never says "published": the fleet can finish a job against an unpromoted
            // package and hand back a blank frame, which reads as success.
            <>Forge {source.forgeState ?? 'queued'}</>
          ) : (
            <>Not sent to Forge</>
          )}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={sending || source.parseState !== 'parsed'}
          onClick={() => void sendToForge()}
        >
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Send to Forge
        </Button>
      </div>
    </div>
  );
}

export function TemplateGrid({
  brandId,
  sources,
  assets,
  loading,
  onChanged,
  className,
}: {
  brandId: string;
  sources: TemplateSource[];
  assets: MediaAsset[];
  loading?: boolean;
  onChanged: () => void;
  className?: string;
}) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  if (loading && sources.length === 0) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading templates…
      </div>
    );
  }
  if (sources.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
        <p className="text-sm font-medium">No templates yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Drop an After Effects project (.aep, .aepx or a collected .zip) anywhere on this page. It
          is stored privately and read on arrival.
        </p>
      </div>
    );
  }
  return (
    <div className={cn(GRID_CLASS, className)}>
      {sources.map((source) => (
        <TemplateCard
          key={source.assetId}
          brandId={brandId}
          source={source}
          asset={byId.get(source.assetId)}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}
