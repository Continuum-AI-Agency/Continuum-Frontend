'use client';

import { datasetCreativeRefSchema } from '@continuum/contracts';
import { useEffect, useMemo, useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  fetchJainaCreativePreview,
  isResolvableCreativeRef,
} from '@/lib/api/jainaCreativePreview.client';

type CreativeCellProps = {
  // The rendered cell text (e.g. the ad name).
  label: string;
  // `row_meta[i].creative` — typed `unknown` upstream, narrowed here.
  creative: unknown;
  display?: 'cell' | 'card';
  alt?: string;
};

type PreviewState = { status: 'idle' | 'loading' | 'ready' | 'error'; url: string | null };

// A creative table cell: shows its label, and on hover-open lazy-resolves a
// fresh preview image (Meta CDN URLs expire) via the creative-preview endpoint.
// Falls back to plain text when the row carries no resolvable creative ref.
export function CreativeCell({
  label,
  creative,
  display = 'cell',
  alt = label,
}: CreativeCellProps) {
  const ref = useMemo(() => {
    const parsed = datasetCreativeRefSchema.safeParse(creative);
    return parsed.success ? parsed.data : null;
  }, [creative]);

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle', url: null });
  const resolvable = ref !== null && isResolvableCreativeRef(ref);
  const shouldResolve = display === 'card' || open;

  useEffect(() => {
    if (!shouldResolve || !ref || !resolvable) return;
    let active = true;
    setPreview({ status: 'loading', url: null });
    fetchJainaCreativePreview(ref)
      .then((res) => {
        if (!active) return;
        const url = res.thumbnail_url ?? res.image_url;
        setPreview({ status: url ? 'ready' : 'error', url });
      })
      .catch(() => {
        if (active) setPreview({ status: 'error', url: null });
      });
    return () => {
      active = false;
    };
  }, [ref, resolvable, shouldResolve]);

  if (display === 'card') {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-muted/30">
        {preview.status === 'ready' && preview.url ? (
          <img src={preview.url} alt={alt} className="size-full object-contain" loading="lazy" />
        ) : !resolvable || preview.status === 'error' ? (
          <span className="text-xs text-muted-foreground">Preview unavailable</span>
        ) : (
          <span
            role="status"
            aria-label={`Loading preview for ${alt}`}
            className="size-full animate-pulse bg-muted/60"
          />
        )}
      </div>
    );
  }

  if (!resolvable) return <span>{label}</span>;

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={200} closeDelay={120}>
      <HoverCardTrigger
        render={
          <span className="cursor-pointer border-b border-dashed border-primary/40 text-primary/90 transition-colors hover:text-primary">
            {label}
          </span>
        }
      />
      <HoverCardContent align="start" className="w-56 p-2">
        {preview.status === 'ready' && preview.url ? (
          <img
            src={preview.url}
            alt={label}
            className="block h-auto max-h-48 w-full rounded-md object-contain"
            loading="lazy"
          />
        ) : preview.status === 'error' ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            Preview unavailable
          </div>
        ) : (
          <div className="h-32 w-full animate-pulse rounded-md bg-muted/60" />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export default CreativeCell;
