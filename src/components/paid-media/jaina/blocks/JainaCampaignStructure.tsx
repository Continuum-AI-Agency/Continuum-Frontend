'use client';

// A proposed campaign, drawn inside the chat (P5 "Structure designs", chosen 2026-10-21).
//
// Five designs, one part each. The Backend chose WHICH (by code, from the question and the
// structure) and printed every figure; nothing here formats money or decides a provenance.
//   01 tree, 04 matrix, 05 funnel — compiled HTML, shown in a sandboxed frame (below)
//   08 diff, 09 outline           — React, from the same nodes
//
// WHY THE COMPILED DESIGNS ARE A FRAME, the reason `JainaOptimizerHyperframes` gives: the
// document is ours and still gets the narrowest sandbox — no `allow-scripts` at all, since
// its animation is CSS. The part carries the durable bucket and path, never a signed url,
// so it is signed on demand. The frame is sized from `html.height` ALONE: a scriptless frame
// cannot report its height, so the compiler lays every row at a fixed height and the
// document is exactly that tall at 375 and at 1280 (`campaignStructureHtml.ts`).
//
// EVERY DESIGN DEGRADES TO THE OUTLINE. A layout this Frontend does not know (projection), a
// compiled picture with no pointer or one that will not sign, a difference with no diff:
// each is drawn as the outline of the same nodes, because a proposal a person cannot read is
// a proposal they cannot approve.

import {
  type CampaignStructurePayload,
  type FieldProvenance,
  HYPERFRAME_UNREACHABLE_NOTE,
  type StructureDiffEntry,
  type StructureField,
  type StructureNode,
} from '@continuum/contracts';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
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

const PROVENANCE_LABEL: Record<FieldProvenance, string> = {
  user_gave: 'You gave this',
  jaina_filled: 'Jaina filled this',
  jaina_asks: 'Jaina asks',
};

const PROVENANCE_CLASS: Record<FieldProvenance, string> = {
  user_gave: 'bg-blue-600/10 text-blue-700 dark:text-blue-300',
  jaina_filled: 'bg-violet-600/10 text-violet-700 dark:text-violet-300',
  jaina_asks: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
};

function ProvenancePill({ provenance }: { provenance: FieldProvenance }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-medium leading-none',
        PROVENANCE_CLASS[provenance],
      )}
      data-provenance={provenance}
    >
      {PROVENANCE_LABEL[provenance]}
    </span>
  );
}

const PROVENANCE_DOT: Record<FieldProvenance, string> = {
  user_gave: 'bg-blue-600',
  jaina_filled: 'bg-violet-600',
  jaina_asks: 'bg-amber-500',
};

/**
 * A field's provenance, compact: a coloured dot keyed by the counts line below, and the full
 * words only where Jaina asks — the one a person has to act on. A pill on every field doubled
 * the outline's length on a phone.
 */
function ProvenanceMark({ provenance }: { provenance: FieldProvenance }) {
  if (provenance === 'jaina_asks') return <ProvenancePill provenance={provenance} />;
  return (
    <span
      className={cn('inline-block size-1.5 shrink-0 rounded-full', PROVENANCE_DOT[provenance])}
      data-provenance={provenance}
      role="img"
      aria-label={PROVENANCE_LABEL[provenance]}
      title={PROVENANCE_LABEL[provenance]}
    />
  );
}

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

const fieldText = (field: StructureField): string =>
  field.value === null ? '—' : `${field.value}${field.unit ? ` ${field.unit}` : ''}`;

function FieldRows({ fields }: { fields: StructureField[] }) {
  if (fields.length === 0) return null;
  return (
    <dl className="mt-1.5 grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {fields.map((field) => (
        <div className="contents" key={field.key}>
          <dt className="truncate text-muted-foreground">{field.label}</dt>
          <dd className="flex min-w-0 items-start gap-1.5">
            <span className="flex min-h-4 items-center">
              <ProvenanceMark provenance={field.provenance} />
            </span>
            <span className="min-w-0 break-words">{fieldText(field)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

const summaryFieldKeys: Record<StructureNode['level'], readonly string[]> = {
  campaign: ['objective', 'campaign_daily_budget_minor_units'],
  adset: ['daily_budget_minor_units', 'audience'],
  ad: ['creative'],
};

/** The one line under a node's name: its budget and audience, or its creative. */
const summaryOf = (node: StructureNode): string =>
  summaryFieldKeys[node.level]
    .map((key) => node.fields.find((field) => field.key === key))
    .filter((field): field is StructureField => Boolean(field))
    .map((field) => (field.value === null ? `${field.label}: Jaina asks` : String(field.value)))
    .join(' · ');

const asksIn = (node: StructureNode): number =>
  node.fields.filter((field) => field.provenance === 'jaina_asks').length;

function OutlineNode({
  node,
  nodes,
  open,
}: {
  node: StructureNode;
  nodes: StructureNode[];
  open: boolean;
}) {
  const children = nodes.filter((child) => child.parent_path_key === node.path_key);
  const summary = summaryOf(node);
  const asks = asksIn(node);
  return (
    <details className="group min-w-0" data-node={node.path_key} open={open}>
      <summary className="flex min-w-0 cursor-pointer list-none items-baseline gap-1.5 py-1 text-sm marker:hidden">
        <span
          aria-hidden
          className="inline-block w-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        >
          ▸
        </span>
        <span
          className="max-w-[70%] shrink-0 break-words font-medium"
          data-testid="structure-node-name"
        >
          {node.name}
        </span>
        {summary ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">· {summary}</span>
        ) : null}
        {asks > 0 ? <ProvenancePill provenance="jaina_asks" /> : null}
      </summary>
      <div className="ml-[0.4rem] border-l border-border pb-1 pl-3">
        <FieldRows fields={node.fields} />
        {children.length > 0 ? (
          <div className="mt-1">
            {children.map((child, index) => (
              <OutlineNode
                key={child.path_key}
                node={child}
                nodes={nodes}
                open={child.level === 'adset' && index === 0}
              />
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** 09 — the collapsible outline. Also what every other design degrades to. */
function StructureOutline({ structure }: { structure: CampaignStructurePayload }) {
  const campaigns = structure.nodes.filter((node) => node.level === 'campaign');
  return (
    <div className="min-w-0 space-y-1" data-testid="campaign-structure-outline">
      {campaigns.map((campaign) => (
        <OutlineNode key={campaign.path_key} node={campaign} nodes={structure.nodes} open />
      ))}
      {structure.truncated ? (
        <p className="text-xs text-muted-foreground">
          {structure.counts.adSets} ad sets and {structure.counts.ads} ads are too many to list
          here. The scaffold card and the canvas show every one.
        </p>
      ) : null}
    </div>
  );
}

const CHANGE_CLASS: Record<StructureDiffEntry['change'], string> = {
  changed: 'border-amber-500/60 bg-amber-500/10',
  added: 'border-emerald-600/60 bg-emerald-600/10',
  removed: 'border-dashed border-red-600/60 bg-red-600/5',
  unchanged: 'border-border bg-background',
};

const CHANGE_MARK: Record<StructureDiffEntry['change'], string> = {
  changed: '~ changed',
  added: '+ added',
  removed: '— removed',
  unchanged: '',
};

const LEVEL_INDENT: Record<StructureDiffEntry['level'], string> = {
  campaign: '',
  adset: 'pl-3',
  ad: 'pl-6',
};

/** The original's own name: a renamed copy carries it as the `name` field's before. */
const sourceNameOf = (entry: StructureDiffEntry): string => {
  const renamed = entry.fields.find((field) => field.key === 'name')?.before;
  return typeof renamed === 'string' ? renamed : entry.name;
};

const valueText = (value: StructureField['value']): string =>
  value === null ? '—' : String(value);

/** 08 — original on the left, the copy on the right; amber changed, green added, red removed. */
function StructureDiffView({ diff }: { diff: NonNullable<CampaignStructurePayload['diff']> }) {
  return (
    <div className="min-w-0" data-testid="campaign-structure-diff">
      <div className={`mb-1.5 grid grid-cols-2 gap-2 ${JAINA_TYPE.label} text-muted-foreground`}>
        <span className="min-w-0 truncate">Original · {diff.source.name}</span>
        <span>Copy</span>
      </div>
      <div className="space-y-1.5">
        {diff.entries.map((entry) => (
          <div
            className={cn('grid grid-cols-2 gap-2', LEVEL_INDENT[entry.level])}
            data-change={entry.change}
            data-node={entry.path_key}
            key={`${entry.change}:${entry.path_key}`}
          >
            <div className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
              {entry.change === 'added' ? (
                <span className="text-muted-foreground">Not in the original</span>
              ) : (
                <>
                  <span className="block break-words font-medium">{sourceNameOf(entry)}</span>
                  {entry.fields.map((field) => (
                    <span className="block break-words text-muted-foreground" key={field.key}>
                      {field.label}: {valueText(field.before)}
                    </span>
                  ))}
                </>
              )}
            </div>
            <div
              className={cn(
                'min-w-0 rounded-md border px-2 py-1.5 text-xs',
                CHANGE_CLASS[entry.change],
              )}
            >
              {entry.change === 'removed' ? (
                <span className="break-words text-red-700 dark:text-red-300">
                  {CHANGE_MARK.removed} · {entry.name}
                </span>
              ) : (
                <>
                  <span className="block break-words font-medium" data-testid="structure-node-name">
                    {entry.name}
                  </span>
                  {CHANGE_MARK[entry.change] ? (
                    <span className="block text-xs text-muted-foreground">
                      {CHANGE_MARK[entry.change]}
                    </span>
                  ) : null}
                  {entry.fields.map((field) => (
                    <span className="block break-words" key={field.key}>
                      {field.label}:{' '}
                      {field.before === null
                        ? valueText(field.after)
                        : `${valueText(field.before)} → ${valueText(field.after)}`}
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
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

type StructureView = 'frame' | 'diff' | 'outline';

/** What the figure will actually show, decided once so the caption can match it. */
const viewOf = (
  structure: CampaignStructurePayload,
  canSignFrame: boolean,
  frameFailed: boolean,
): StructureView => {
  if (structure.layout === 'diff' && structure.diff) return 'diff';
  const compiled =
    structure.layout === 'tree' || structure.layout === 'matrix' || structure.layout === 'funnel';
  return compiled && structure.html && canSignFrame && !frameFailed ? 'frame' : 'outline';
};

export type JainaCampaignStructureProps = { structure: CampaignStructurePayload };

export function JainaCampaignStructure({ structure }: JainaCampaignStructureProps) {
  const { sessionId } = useScaffoldThread();
  const scope = useJainaBrandScope();
  const [frameFailed, setFrameFailed] = useState(false);
  const onUnreachable = useCallback(() => setFrameFailed(true), []);
  const view = viewOf(structure, Boolean(scope?.brandId), frameFailed);
  const canvasHref = structure.parentScaffoldId
    ? scaffoldCanvasHref(structure.parentScaffoldId, sessionId)
    : (structure.canvasHref ?? null);
  // A compiled document prints its own title and counts; saying them twice is noise.
  const framed = view === 'frame';

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
          {framed ? null : (
            <span className="block break-words text-sm font-semibold">{structure.title}</span>
          )}
        </span>
        {canvasHref ? (
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
      {view === 'diff' && structure.diff ? <StructureDiffView diff={structure.diff} /> : null}
      {framed && structure.html && scope?.brandId ? (
        <StructureFrame
          brandId={scope.brandId}
          html={structure.html}
          onUnreachable={onUnreachable}
          title={`${LAYOUT_LABEL[structure.layout]} · ${structure.title}`}
        />
      ) : null}
      {view === 'outline' ? <StructureOutline structure={structure} /> : null}
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
