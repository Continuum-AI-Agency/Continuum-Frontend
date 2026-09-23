'use client';

// A compiled optimizer card, shown inside a Jaina answer.
//
// The cited card next door draws itself from a stored read. This one is already drawn: a
// self-contained animated document compiled by `accountCardHtml` with no model in the loop,
// uploaded whole, and shown in a frame. Jaina chose WHICH card; she cannot author what it
// says, because the figures were baked in by the compiler from the detector's own output.
//
// WHY IT SIGNS ON DEMAND. The part carries the durable bucket and path, never a signed url —
// a signed url lasts about an hour and a transcript is read back months later, so a part
// carrying one would render for a while and then break with nothing saying why.
// `signHyperframeAsset` caches per bucket+path and collapses concurrent callers, which is the
// same thing every planner surface does with the same documents.
//
// WHY A SANDBOXED FRAME. The document is ours, compiled by us, and still gets the narrowest
// sandbox that lets it run: it needs scripts for nothing — the animation is pure CSS — so it
// is loaded with no `allow-scripts` at all. Nothing it contains can reach the page around it.

import {
  ACCOUNT_DETECTOR_META,
  HYPERFRAME_UNREACHABLE_NOTE,
  type JainaHyperframe,
  type JainaHyperframeSet,
} from '@continuum/contracts';
import { useEffect, useState } from 'react';

import { useJainaBrandScope } from '@/lib/jaina/brandScope';
import { signHyperframeAsset } from '@/lib/organic/hyperframeSign';

type FrameState = 'loading' | 'ready' | 'unreachable';

function Frame({ brandId, frame }: { brandId: string; frame: JainaHyperframe }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<FrameState>('loading');
  const label = ACCOUNT_DETECTOR_META[frame.detector].label;

  useEffect(() => {
    let live = true;
    setState('loading');
    signHyperframeAsset({ brandId, bucket: frame.bucket, path: frame.path })
      .then((signed) => {
        if (!live) return;
        setUrl(signed);
        setState(signed ? 'ready' : 'unreachable');
      })
      .catch(() => {
        // The reason belongs in a line the reader can see, not in a blank box.
        if (live) setState('unreachable');
      });
    return () => {
      live = false;
    };
  }, [brandId, frame.bucket, frame.path]);

  return (
    <figure
      className="m-0 min-w-0"
      data-detector={frame.detector}
      data-testid="optimizer-hyperframe"
    >
      <div
        className="relative overflow-hidden rounded-lg border border-border/60 bg-card"
        // The card is square by design — it is read in a chat column and in a feed — so the
        // box keeps that ratio instead of guessing a height.
        style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
      >
        {state === 'ready' && url ? (
          <iframe
            className="absolute inset-0 size-full border-0"
            loading="lazy"
            sandbox=""
            src={url}
            title={label}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-4">
            <p className="text-center text-2xs text-muted-foreground">
              {state === 'loading' ? 'Drawing…' : HYPERFRAME_UNREACHABLE_NOTE}
            </p>
          </div>
        )}
      </div>
      <figcaption className="mt-1.5 text-3xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export type JainaOptimizerHyperframesProps = { sets: JainaHyperframeSet[] };

export function JainaOptimizerHyperframes({ sets }: JainaOptimizerHyperframesProps) {
  const scope = useJainaBrandScope();
  const brandId = scope?.brandId ?? null;
  if (!brandId || sets.length === 0) return null;

  return (
    <div className="space-y-2">
      {sets.map((set) => (
        <section key={`${set.read_id}:${set.frames.map((f) => f.candidate_id).join(',')}`}>
          {/* One row, up to three. Square cards side by side share a baseline for free. */}
          <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            {set.frames.map((frame) => (
              <Frame brandId={brandId} frame={frame} key={frame.candidate_id} />
            ))}
          </div>
          <p className="mt-1.5 text-3xs text-muted-foreground">
            {set.read_day
              ? `compiled from the read of ${set.read_day}`
              : 'compiled from a stored read'}
          </p>
        </section>
      ))}
    </div>
  );
}
