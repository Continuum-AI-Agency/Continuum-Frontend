'use client';

// A protected link shows only stored previews. Until one exists for this asset
// (library-share asks for it when the link becomes protected), say so — in the
// link's own colours — and look again on a short, bounded schedule. Never the original.

import { Loader2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

// Look again quickly at first, then more slowly, and for longer than the Backend's
// ten-minute back-off after a failed preview, so a retried preview still appears on its own.
const FAST_RETRY_MS = 8_000;
const SLOW_RETRY_MS = 30_000;
const FAILED_RETRY_MS = 60_000;
const FAST_WINDOW_MS = 2 * 60_000;
const GIVE_UP_AFTER_MS = 15 * 60_000;

export function SharePreparingPreview({
  assetId,
  label,
  posterUrl,
  failed = false,
  compact = false,
}: {
  assetId: string;
  label: string;
  posterUrl: string | null;
  /** The last attempt failed; the Backend retries after a back-off. */
  failed?: boolean;
  /** A comment attachment's tile rather than a full stage. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [startedAt] = useState(() => Date.now());
  const [tries, setTries] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= GIVE_UP_AFTER_MS) {
      setGaveUp(true);
      return;
    }
    const wait = failed
      ? FAILED_RETRY_MS
      : elapsed < FAST_WINDOW_MS
        ? FAST_RETRY_MS
        : SLOW_RETRY_MS;
    const timer = window.setTimeout(() => {
      router.refresh();
      setTries((count) => count + 1);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [router, tries, failed, startedAt]);

  if (compact) {
    return (
      <button
        type="button"
        data-share-preparing={assetId}
        onClick={() => router.refresh()}
        title={`${label}: preparing preview — click to check again`}
        className="flex size-16 flex-col items-center justify-center gap-1 rounded-md border border-border bg-muted/40 text-2xs text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        Preparing…
      </button>
    );
  }
  return (
    <div
      data-share-preparing={assetId}
      data-preview-failed={failed ? 'true' : undefined}
      className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border border-border bg-muted/40 px-6 text-center"
    >
      {posterUrl ? (
        // Signed storage URL of a stored poster, cross-origin and short-lived.
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 size-full object-contain opacity-30"
        />
      ) : null}
      <Loader2 className="relative size-6 animate-spin text-primary" aria-hidden />
      <p className="relative text-sm font-medium text-foreground">Preparing preview…</p>
      <p className="relative max-w-xs text-xs text-muted-foreground">
        {gaveUp
          ? `${label} is taking longer than usual to prepare. Try again later.`
          : failed
            ? `${label} could not be prepared yet; it will be tried again shortly.`
            : `${label} is being prepared for protected viewing. It appears here on its own.`}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="relative"
        onClick={() => router.refresh()}
      >
        <RefreshCw className="size-3.5" aria-hidden />
        Refresh
      </Button>
    </div>
  );
}
