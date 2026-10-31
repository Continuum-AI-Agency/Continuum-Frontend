'use client';

// A proposed campaign, drawn inside the chat (P5 "Structure designs", chosen 2026-10-21).
//
// Five designs, one part each. The Backend chose WHICH (by code, from the question and the
// structure) and printed every figure; nothing here decides a provenance.
//   01 tree, 04 matrix, 05 funnel — compiled HTML, shown in a sandboxed frame (below)
//   08 diff, 09 outline           — the canvas's own Read pieces at chat size (design C,
//                                   option 27): changes first, the budget, Open in canvas.
//
// WHY THE COMPILED DESIGNS ARE A FRAME, the reason `JainaOptimizerHyperframes` gives: the
// document is ours and still gets the narrowest sandbox — no `allow-scripts` at all, since
// its animation is CSS. The part carries the durable bucket and path, never a signed url,
// so it is signed on demand. The frame is sized from `html.height` ALONE: a scriptless frame
// cannot report its height, so the compiler lays every row at a fixed height and the
// document is exactly that tall at 375 and at 1280 (`campaignStructureHtml.ts`).
//
// EVERY DESIGN DEGRADES TO READ. A layout this Frontend does not know (projection), a compiled
// picture with no pointer or one that will not sign, a difference with no diff: each is drawn
// as the Read card of the same nodes, because a proposal a person cannot read is a proposal
// they cannot approve.

import {
  type CampaignStructurePayload,
  type FieldProvenance,
  HYPERFRAME_UNREACHABLE_NOTE,
} from '@continuum/contracts';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LecturaView } from '@/CampaignCanvas/lectura/LecturaView';
import { buttonVariants } from '@/components/ui/button';
import { campaignViewFromStructure } from '@/lib/campaign-canvas/lectura';
import { useJainaBrandScope } from '@/lib/jaina/brandScope';
import { signHyperframeAsset } from '@/lib/organic/hyperframeSign';
import { cn } from '@/lib/utils';
import { JAINA_TYPE } from '../reading';
import { scaffoldCanvasHref, useScaffoldThread } from '../scaffold/scaffoldThreadContext';

const LAYOUT_LABEL: Record<CampaignStructurePayload['layout'], string> = {
  tree: 'Campaign structure',
  matrix: 'Audience × creative',
  funnel: 'Funnel map',
  diff: 'Original vs copy',
  outline: 'Outline',
};

const PROVENANCE_CLASS: Record<FieldProvenance, string> = {
  user_gave: 'bg-blue-600/10 text-blue-700 dark:text-blue-300',
  jaina_filled: 'bg-violet-600/10 text-violet-700 dark:text-violet-300',
  jaina_asks: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
};

const PROVENANCE_DOT: Record<FieldProvenance, string> = {
  user_gave: 'bg-blue-600',
  jaina_filled: 'bg-violet-600',
  jaina_asks: 'bg-amber-500',
};

/** Mock-up 09's foot: how many fields the person gave, Jaina filled, and Jaina still asks. */
function CountsLine({ counts }: { counts: CampaignStructurePayload['counts'] }) {
  const items: [FieldProvenance, string][] = [
    ['user_gave', `You gave ${counts.userGave}`],
    ['jaina_filled', `Jaina filled ${counts.jainaFilled}`],
    ['jaina_asks', `Jaina asks ${counts.jainaAsks}`],
  ];
  return (
    <p className="flex flex-wrap gap-1.5 text-xs" data-testid="campaign-structure-counts">
      {items.map(([provenance, label]) => (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
            PROVENANCE_CLASS[provenance],
          )}
          key={provenance}
        >
          <span className={cn('size-1.5 rounded-full', PROVENANCE_DOT[provenance])} />
          {label}
        </span>
      ))}
    </p>
  );
}

type FrameState = 'loading' | 'ready' | 'unreachable';

/** 01 / 04 / 05 — the compiled document, signed on demand, in a frame with no scripts. */
function StructureFrame({
  brandId,
  html,
  title,
  onUnreachable,
}: {
  brandId: string;
  html: NonNullable<CampaignStructurePayload['html']>;
  title: string;
  onUnreachable: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<FrameState>('loading');

  useEffect(() => {
    let live = true;
    setState('loading');
    signHyperframeAsset({ brandId, bucket: html.bucket, path: html.path })
      .then((signed) => {
        if (!live) return;
        setUrl(signed);
        setState(signed ? 'ready' : 'unreachable');
      })
      .catch(() => {
        if (live) setState('unreachable');
      });
    return () => {
      live = false;
    };
  }, [brandId, html.bucket, html.path]);

  useEffect(() => {
    if (state === 'unreachable') onUnreachable();
  }, [state, onUnreachable]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-muted/40"
      data-testid="campaign-structure-frame"
      style={{ height: html.height }}
    >
      {state === 'ready' && url ? (
        <iframe
          className="absolute inset-0 size-full border-0"
          loading="lazy"
          sandbox=""
          src={url}
          title={title}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center p-4">
          <p className="text-center text-xs text-muted-foreground">
            {state === 'loading' ? 'Drawing…' : HYPERFRAME_UNREACHABLE_NOTE}
          </p>
        </div>
      )}
    </div>
  );
}

type StructureView = 'frame' | 'read';

/** What the figure will actually show, decided once so the caption can match it. */
const viewOf = (
  structure: CampaignStructurePayload,
  canSignFrame: boolean,
  frameFailed: boolean,
): StructureView => {
  const compiled =
    structure.layout === 'tree' || structure.layout === 'matrix' || structure.layout === 'funnel';
  return compiled && structure.html && canSignFrame && !frameFailed ? 'frame' : 'read';
};

/** The drawings made from nodes (Read at chat size), not from a compiled picture. */
export const isReadStructure = (structure: CampaignStructurePayload): boolean =>
  structure.layout === 'diff' || structure.layout === 'outline';

export type JainaCampaignStructureProps = { structure: CampaignStructurePayload };

export function JainaCampaignStructure({ structure }: JainaCampaignStructureProps) {
  const { sessionId, onScaffoldFocus } = useScaffoldThread();
  const scope = useJainaBrandScope();
  const [frameFailed, setFrameFailed] = useState(false);
  const onUnreachable = useCallback(() => setFrameFailed(true), []);
  const view = viewOf(structure, Boolean(scope?.brandId), frameFailed);
  const canvasHref = structure.parentScaffoldId
    ? scaffoldCanvasHref(structure.parentScaffoldId, sessionId)
    : (structure.canvasHref ?? null);
  // A compiled document prints its own title and counts; saying them twice is noise.
  const framed = view === 'frame';
  const model = useMemo(() => campaignViewFromStructure(structure), [structure]);
  const parentScaffoldId = structure.parentScaffoldId;
  const openInCompanion =
    onScaffoldFocus && parentScaffoldId ? () => onScaffoldFocus(parentScaffoldId) : undefined;

  return (
    <figure
      className="m-0 min-w-0 rounded-xl border border-border bg-card/40 p-3"
      data-layout={structure.layout}
      data-part-id={structure.partId}
      data-testid="campaign-structure"
    >
      <figcaption className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0">
          <span className={`block ${JAINA_TYPE.label} text-muted-foreground`}>
            {LAYOUT_LABEL[structure.layout]} · version {structure.version}
          </span>
        </span>
        {/* Read carries its own "Open in canvas"; a compiled picture needs the link here. */}
        {framed && canvasHref ? (
          <Link
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-7 gap-1.5' })}
            data-testid="campaign-structure-open-canvas"
            href={canvasHref}
          >
            <ExternalLink className="size-3.5" />
            Open on canvas
          </Link>
        ) : null}
      </figcaption>
      {framed && structure.html && scope?.brandId ? (
        <StructureFrame
          brandId={scope.brandId}
          html={structure.html}
          onUnreachable={onUnreachable}
          title={`${LAYOUT_LABEL[structure.layout]} · ${structure.title}`}
        />
      ) : null}
      {view === 'read' ? (
        <LecturaView
          size="chat"
          model={model}
          title={structure.title}
          onOpen={openInCompanion}
          openHref={canvasHref}
        />
      ) : null}
      {view === 'read' && structure.truncated ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {structure.counts.adSets} ad sets and {structure.counts.ads} ads are too many to list
          here. The scaffold card and the canvas show every one.
        </p>
      ) : null}
      {framed ? null : (
        <div className="mt-2">
          <CountsLine counts={structure.counts} />
        </div>
      )}
    </figure>
  );
}

export type JainaCampaignStructuresProps = { structures: CampaignStructurePayload[] };

/** Every drawing a turn made, in order — "01 + 04 together" is two of them. */
export function JainaCampaignStructures({ structures }: JainaCampaignStructuresProps) {
  if (structures.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="campaign-structures">
      {structures.map((structure) => (
        <JainaCampaignStructure key={structure.partId} structure={structure} />
      ))}
    </div>
  );
}
