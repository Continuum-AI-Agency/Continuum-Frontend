'use client';

import type { CheckpointBlockV2, CheckpointReportV2 } from '@/lib/jaina/schemas';
import { BlockRenderer } from '../blocks/BlockRenderer';
import { countBlockCitations } from '../blocks/citations';
import { MediaMapProvider } from '../blocks/mediaText';
import { JainaProse } from '../blocks/prose';
import {
  JainaJustificationSection,
  partitionReportBlocks,
} from '../components/JainaJustificationSection';

// The paper layout for a Jaina report.
//
// It renders NODE BY NODE through the same `BlockRenderer` the chat uses, so a
// chart here is the same Recharts SVG the user was just looking at — vector, not a
// photograph of one. What this component adds over the chat card is the furniture a
// document needs and a conversation does not: a header that says what was measured
// and over what window, and a footer that says where the numbers came from. The body
// is split exactly as the chat splits it — the answer, then its Justification — so the
// paper and the screen read alike.

type JainaReportDocumentProps = {
  report: CheckpointReportV2;
  /** Respects the chat's per-module visibility toggles. */
  blocks: CheckpointBlockV2[];
  title?: string;
  generatedAt?: Date;
};

export type Period = { since: string | null; until: string | null; label: string | null };

/** Widest window any block was computed over — the report's real reporting period. */
export function resolvePeriod(blocks: CheckpointBlockV2[]): Period {
  let since: string | null = null;
  let until: string | null = null;
  let label: string | null = null;
  for (const block of blocks) {
    const period = block.provenance?.period;
    if (!period) continue;
    if (period.since && (!since || period.since < since)) since = period.since;
    if (period.until && (!until || period.until > until)) until = period.until;
    if (!label && period.requested_label) label = period.requested_label;
  }
  return { since, until, label };
}

export function formatPeriod(period: Period): string | null {
  if (period.label) return period.label;
  if (period.since && period.until) return `${period.since} — ${period.until}`;
  return period.since ?? period.until;
}

/** The entity the report is about, when the blocks agree on one. */
export function resolveEntityLabel(blocks: CheckpointBlockV2[]): string | null {
  const labels = new Set(
    blocks
      .map((block) => block.provenance?.entity_label)
      .filter((value): value is string => Boolean(value)),
  );
  return labels.size === 1 ? [...labels][0] : null;
}

export function JainaReportDocument({
  report,
  blocks,
  title = 'Performance Report',
  generatedAt = new Date(),
}: JainaReportDocumentProps) {
  const period = resolvePeriod(blocks);
  const periodLabel = formatPeriod(period);
  const entityLabel = resolveEntityLabel(blocks);
  const citationCount = countBlockCitations(blocks);
  const computedCount = blocks.filter((block) => block.provenance?.source === 'computed').length;
  const hasMedia = report._meta.has_media && Object.keys(report.media_map).length > 0;
  const sections = partitionReportBlocks(blocks);
  const renderExportBlock = (block: CheckpointBlockV2) => (
    <section
      key={block.block_id}
      className="jaina-export-block"
      data-block-id={block.block_id}
      data-category={block.category}
    >
      <BlockRenderer block={block} isStreaming={false} />
    </section>
  );

  const document = (
    <div className="jaina-export-root" lang={report.language}>
      <header className="jaina-export-header">
        <div>
          <h1 className="jaina-export-title">{title}</h1>
          <p className="jaina-export-subtitle">
            {[entityLabel, report._meta.primary_scope].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="jaina-export-meta">
          {periodLabel ? <div>{periodLabel}</div> : null}
          <div>Generated {generatedAt.toISOString().split('T')[0]}</div>
        </div>
      </header>

      {report.executive_summary ? (
        <JainaProse
          content={report.executive_summary}
          className="jaina-export-summary text-sm leading-relaxed"
          mode="static"
        />
      ) : null}

      {sections.answer.length > 0 ? (
        <div data-report-section="answer">{sections.answer.map(renderExportBlock)}</div>
      ) : null}

      <JainaJustificationSection blocks={sections.justification} renderBlock={renderExportBlock} />

      <footer className="jaina-export-footer">
        <span>
          {computedCount} of {blocks.length} modules computed from live data
          {citationCount > 0 ? ` · ${citationCount} citations` : ''}
        </span>
        <span>Continuum · Jaina</span>
      </footer>
    </div>
  );

  if (!hasMedia) return document;
  return <MediaMapProvider mediaMap={report.media_map}>{document}</MediaMapProvider>;
}

export default JainaReportDocument;
