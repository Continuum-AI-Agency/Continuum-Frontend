'use client';

// Emphasis inside a sentence — the one place a prose mark or a `**bold**` run becomes pixels.
//
// The structured blocks were already coloured: a metric grid reads `severity`, an insight
// card draws its rule from it. The PROSE was not. The executive summary, a narrative body,
// an insight's own sentence and an action's clause all arrived as flat ink, because two
// different things were true at once: the model was never asked to emphasise anything
// (`PROSE_EMPHASIS_RULE` on the Backend), and three of the four surfaces printed the raw
// string with no markdown pass at all — `InsightListBlock` and `ActionsBlock` would have
// shown a literal `**ITESO**` had the model ever written one.
//
// The grammar lives in `@continuum/contracts` (`parseProseMarks`): `[risk: 0.90 ROAS]`,
// `[watch: …]`, `[positive: …]`, `[neutral: …]`, `[window: last 30 days]`. Colour comes from
// `reading.ts` and nowhere else, so a marked figure in a sentence is the same red as the
// same figure in a grid. `neutral` is set in the ink colour on purpose — judged, and fine —
// and `window` in the muted one. Weight carries hierarchy: a judged figure is bold and
// tabular whatever its tone, and an entity name in bold is set in ink even inside muted
// supporting prose, because it is the thing the sentence is about.
//
// Two renderers, one grammar:
//   `JainaProse`  — long prose (summary, narrative body, a chat turn). Text runs go through
//                   `SafeMarkdown`; marks and `[cite:id]` chips are React spans between them.
//   `InlineProse` — a short structured string (an insight's summary, an action's clause).
//                   No Streamdown: bold, marks and the item's own `highlight`, nothing else.

import { type ProseMarkTone, type ProseSegment, parseProseMarks } from '@continuum/contracts';
import type { ReactNode } from 'react';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import type { Severity } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { JUDGEMENT_TEXT, judgeValue } from '../reading';
import {
  type BlockCitation,
  CitationChip,
  parseNarrativeCitations,
  type ResolvedCitation,
} from './citations';
import { MediaText } from './mediaText';

/** A judged figure is emphasised whatever its tone; only the colour says which tone. */
const JUDGED_FIGURE = 'font-semibold tabular-nums';

/** The text class per mark tone. The four judgements come from `reading.ts`. */
const MARK_TEXT: Record<ProseMarkTone, string> = {
  risk: cn(JUDGEMENT_TEXT.risk, JUDGED_FIGURE),
  watch: cn(JUDGEMENT_TEXT.watch, JUDGED_FIGURE),
  positive: cn(JUDGEMENT_TEXT.positive, JUDGED_FIGURE),
  neutral: cn(JUDGEMENT_TEXT.neutral, JUDGED_FIGURE),
  window: 'text-muted-foreground',
};

export function ProseMark({ tone, children }: { tone: ProseMarkTone; children: ReactNode }) {
  return (
    <span className={MARK_TEXT[tone]} data-prose-mark={tone}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// InlineProse
// ---------------------------------------------------------------------------

const BOLD_PATTERN = /\*\*([^*\n]+)\*\*/g;

/** Streamdown sets bold with no colour of its own; here the entity is set in ink. */
const ENTITY = 'font-semibold text-foreground';

function renderBold(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD_PATTERN)) {
    if (match.index > last) {
      nodes.push(
        <MediaText key={`${keyPrefix}-t${last}`}>{text.slice(last, match.index)}</MediaText>,
      );
    }
    nodes.push(
      <strong key={`${keyPrefix}-b${match.index}`} className={ENTITY}>
        {match[1]}
      </strong>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(<MediaText key={`${keyPrefix}-t${last}`}>{text.slice(last)}</MediaText>);
  }
  return nodes;
}

/** Where the highlight sits in a run: verbatim first, then forgiving the model's casing. */
function findHighlight(run: string, highlight: string): number {
  const exact = run.indexOf(highlight);
  return exact >= 0 ? exact : run.toLowerCase().indexOf(highlight.toLowerCase());
}

type InlineProseProps = {
  text: string;
  /** The span of `text` that `severity` judges — an insight item's `highlight`. */
  highlight?: string | null;
  severity?: Severity | null;
};

export function InlineProse({ text, highlight, severity }: InlineProseProps) {
  const nodes: ReactNode[] = [];
  let pending = highlight?.trim() || null;
  parseProseMarks(text).forEach((segment, index) => {
    if (segment.kind === 'mark') {
      nodes.push(
        <ProseMark key={`m${index}`} tone={segment.tone}>
          {segment.value}
        </ProseMark>,
      );
      return;
    }
    let run = segment.value;
    if (pending) {
      const at = findHighlight(run, pending);
      if (at >= 0) {
        nodes.push(...renderBold(run.slice(0, at), `${index}a`));
        nodes.push(
          <span
            key={`h${index}`}
            className={cn(JUDGEMENT_TEXT[judgeValue(severity)], JUDGED_FIGURE)}
            data-prose-highlight=""
          >
            {run.slice(at, at + pending.length)}
          </span>,
        );
        run = run.slice(at + pending.length);
        pending = null;
      }
    }
    nodes.push(...renderBold(run, `${index}b`));
  });
  return <>{nodes}</>;
}

// ---------------------------------------------------------------------------
// JainaProse
// ---------------------------------------------------------------------------

type ProseRun = ProseSegment | { kind: 'citation'; resolved: ResolvedCitation; key: string };

function segmentParagraph(
  paragraph: string,
  citations: readonly BlockCitation[] | undefined,
): ProseRun[] {
  return parseNarrativeCitations(paragraph, citations).flatMap((segment) =>
    segment.kind === 'text' ? parseProseMarks(segment.value) : [segment],
  );
}

// Streamdown's root is a block `div` holding a `p`. Both must flow inline for a mark or a
// chip to sit INSIDE the sentence rather than start a new line after it.
const INLINE_RUNS = '[&>div]:inline [&_p]:m-0 [&_p]:inline';
const ENTITY_INK = '[&_[data-streamdown=strong]]:text-foreground';

type JainaProseProps = {
  content: string;
  className?: string;
  mode?: 'streaming' | 'static';
  isAnimating?: boolean;
  /** The block's citations, for `[cite:id]` markers in the prose. */
  citations?: readonly BlockCitation[];
};

export function JainaProse({
  content,
  className,
  mode = 'static',
  isAnimating,
  citations,
}: JainaProseProps) {
  if (!content.trim()) return null;
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => segmentParagraph(paragraph, citations));
  const plain = !paragraphs.some((runs) => runs.some((run) => run.kind !== 'text'));

  // Nothing to place inside a sentence: one markdown pass over the whole prose, so lists,
  // tables and paragraph rhythm are exactly Streamdown's. Rejoined from the runs rather
  // than passed through, because an unresolvable `[cite:id]` has already been dropped by
  // the citation parser and must never reach the reader as a literal.
  if (plain) {
    const text = paragraphs.map((runs) => runs.map((run) => run.value).join('')).join('\n\n');
    return (
      <SafeMarkdown
        content={text}
        className={cn(ENTITY_INK, className)}
        mode={mode}
        isAnimating={isAnimating}
      />
    );
  }

  return (
    <div className={cn('space-y-3', ENTITY_INK, className)} data-prose="marked">
      {paragraphs.map((runs, paragraphIndex) => (
        // Paragraph order is the only identity a run of prose has.
        // biome-ignore lint/suspicious/noArrayIndexKey: positional prose runs
        <div key={paragraphIndex} className={INLINE_RUNS}>
          {runs.map((run, runIndex) => {
            if (run.kind === 'text') {
              return (
                <SafeMarkdown
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional prose runs
                  key={`t${runIndex}`}
                  content={run.value}
                  mode={mode}
                  isAnimating={isAnimating}
                />
              );
            }
            if (run.kind === 'mark') {
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional prose runs
                <ProseMark key={`m${runIndex}`} tone={run.tone}>
                  {run.value}
                </ProseMark>
              );
            }
            return <CitationChip key={run.key} resolved={run.resolved} />;
          })}
        </div>
      ))}
    </div>
  );
}
