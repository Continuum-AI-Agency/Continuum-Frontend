'use client';

// Shared citation/provenance rendering for the Jaina V2 analytical blocks
// (narrative, insight_list, comparison). Each block carries a `citations`
// list ({ id, tool, cache_key, label }); narrative bodies reference them with
// inline `[cite:<id>]` markers, while insight items and comparison pairs
// reference them by `cite_ids`. This module owns resolving those references
// into citation objects and rendering the inline hover affordance + the
// collapsed per-block Sources footer so the three blocks don't diverge.

import {
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';
import { Badge } from '@/components/ui/badge';
import { HoverCardTrigger } from '@/components/ui/hover-card';
import type { CheckpointBlockV2, NarrativeBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';

// The citation shape is identical across every analytical block; derive it from
// the narrative block so this module never re-imports the contract directly.
export type BlockCitation = NarrativeBlockV2['citations'][number];

// A citation paired with its 1-based position in the block's citation list, so
// inline chips and the Sources footer share the same numbering.
export type ResolvedCitation = { citation: BlockCitation; index: number };

const CITE_MARKER_PATTERN = /\[cite:([^\]]+)\]/g;

export type NarrativeSegment =
  | { kind: 'text'; value: string }
  | { kind: 'citation'; resolved: ResolvedCitation; key: string };

function buildCitationIndex(
  citations: readonly BlockCitation[] | undefined,
): Map<string, ResolvedCitation> {
  const byId = new Map<string, ResolvedCitation>();
  (citations ?? []).forEach((citation, position) => {
    if (!byId.has(citation.id)) {
      byId.set(citation.id, { citation, index: position + 1 });
    }
  });
  return byId;
}

// Resolve an item/pair's `cite_ids` into ordered, de-duplicated citations. Ids
// with no matching citation are dropped so a dangling reference never surfaces.
export function resolveCiteIds(
  citeIds: readonly string[] | undefined,
  citations: readonly BlockCitation[] | undefined,
): ResolvedCitation[] {
  const byId = buildCitationIndex(citations);
  const seen = new Set<string>();
  const resolved: ResolvedCitation[] = [];
  for (const rawId of citeIds ?? []) {
    const id = rawId.trim();
    if (seen.has(id)) continue;
    const hit = byId.get(id);
    if (!hit) continue;
    seen.add(id);
    resolved.push(hit);
  }
  return resolved;
}

// Split a narrative body into text runs and resolved inline citations. Matched
// `[cite:id]` markers become citation segments; unmatched markers are stripped
// so the raw literal never renders and adjacent prose stays contiguous. A body
// with no resolvable markers collapses to a single text segment, letting the
// caller keep the untouched single-markdown render.
export function parseNarrativeCitations(
  body: string,
  citations: readonly BlockCitation[] | undefined,
): NarrativeSegment[] {
  const byId = buildCitationIndex(citations);
  const segments: NarrativeSegment[] = [];
  let buffer = '';
  let lastIndex = 0;
  let citeCount = 0;

  CITE_MARKER_PATTERN.lastIndex = 0;
  let match = CITE_MARKER_PATTERN.exec(body);
  while (match !== null) {
    buffer += body.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;
    const id = match[1].trim();
    const hit = byId.get(id);
    if (hit) {
      if (buffer.length > 0) {
        segments.push({ kind: 'text', value: buffer });
        buffer = '';
      }
      citeCount += 1;
      segments.push({ kind: 'citation', resolved: hit, key: `cite-${id}-${citeCount}` });
    }
    // Unmatched markers fall through: they are simply not appended, so the
    // surrounding prose merges and the literal `[cite:id]` never renders.
    match = CITE_MARKER_PATTERN.exec(body);
  }
  buffer += body.slice(lastIndex);
  if (buffer.length > 0) segments.push({ kind: 'text', value: buffer });

  return segments;
}

function citationSummary(citation: BlockCitation): {
  title: string;
  description: string | undefined;
} {
  const label = citation.label?.trim();
  return { title: citation.tool, description: label ? label : undefined };
}

// Inline hover affordance for a single resolved citation. Rendered inside the
// prose of a narrative body and inside the chip rows of insight/comparison
// blocks. NOTE: ai-elements' `InlineCitationCardTrigger` assumes URL sources
// (`new URL(sources[0])`), but Jaina citations are tool/label/cache_key with no
// URL, so we drive the HoverCard trigger ourselves with a numbered Badge.
export function CitationChip({ resolved }: { resolved: ResolvedCitation }) {
  const { citation, index } = resolved;
  const { title, description } = citationSummary(citation);
  const ariaLabel = `Source ${index}: ${title}${description ? ` — ${description}` : ''}`;

  return (
    <InlineCitationCard>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="mx-0.5 inline-flex cursor-pointer align-super focus-visible:outline-none"
        >
          <Badge
            variant="secondary"
            className="h-4 min-w-4 rounded-full px-1 text-[0.625rem] font-medium leading-none"
          >
            {index}
          </Badge>
        </button>
      </HoverCardTrigger>
      <InlineCitationCardBody className="w-72 p-3">
        <InlineCitationSource title={title} description={description}>
          {citation.cache_key ? (
            <p className="truncate font-mono text-[0.625rem] text-muted-foreground/70">
              {citation.cache_key}
            </p>
          ) : null}
        </InlineCitationSource>
      </InlineCitationCardBody>
    </InlineCitationCard>
  );
}

// A compact inline row of numbered citation chips for an insight item or a
// comparison pair. Renders nothing when no cite_ids resolve.
export function CitationChips({
  citeIds,
  citations,
  className,
}: {
  citeIds: readonly string[] | undefined;
  citations: readonly BlockCitation[] | undefined;
  className?: string;
}) {
  const resolved = resolveCiteIds(citeIds, citations);
  if (resolved.length === 0) return null;

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-0.5 align-middle', className)}>
      {resolved.map((entry) => (
        <CitationChip key={`${entry.citation.id}-${entry.index}`} resolved={entry} />
      ))}
    </span>
  );
}

function sourceLabel(citation: BlockCitation, position: number): string {
  const label = citation.label?.trim();
  return `${position}. ${citation.tool}${label ? ` — ${label}` : ''}`;
}

// Collapsed per-block "Sources" footer, built from the block's own citation
// list. Rendered only when the block carries at least one citation.
export function BlockSourcesFooter({
  citations,
  className,
}: {
  citations: readonly BlockCitation[] | undefined;
  className?: string;
}) {
  const list = citations ?? [];
  if (list.length === 0) return null;

  return (
    <Sources className={cn('mt-2 mb-0', className)}>
      <SourcesTrigger count={list.length} />
      <SourcesContent>
        {list.map((citation, position) => (
          <Source key={citation.id} href="#" title={sourceLabel(citation, position + 1)} />
        ))}
      </SourcesContent>
    </Sources>
  );
}

// Total number of citation references across a report's blocks — powers the
// "Sourced" header badge. Derived from the rendered blocks (the FE report
// `_meta` schema does not carry `has_citations`), so it reflects exactly what
// is renderable.
export function countBlockCitations(blocks: readonly CheckpointBlockV2[]): number {
  return blocks.reduce((total, block) => {
    if ('citations' in block && Array.isArray(block.citations)) {
      return total + block.citations.length;
    }
    return total;
  }, 0);
}
