'use client';

// Trust-but-verify provenance affordance for Jaina report blocks. A small
// info icon beside the block title; hovering (or focusing) it reveals WHERE
// the numbers came from: backend-computed verbatim from a registered dataset
// (source tool, actual data period, entity, record count) vs model-authored
// from gathered evidence. Follows the GlossaryTooltip idiom (IMP-018) so the
// provenance is exposed via aria-describedby, not hover-only.

import { InfoIcon } from 'lucide-react';
import { useId } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PROVENANCE_TEXT } from '../answerLanguage';
import { useAnswerLanguage } from '../answerLanguageContext';

type BlockProvenance = {
  source: 'computed' | 'model';
  tool?: string | null;
  period?: {
    since?: string | null;
    until?: string | null;
    requested_label?: string | null;
  } | null;
  entity_label?: string | null;
  record_count?: number | null;
};

type EvidenceTooltipProps = {
  provenance?: BlockProvenance | null;
  datasetId?: string | null;
  evidenceRefs?: string[] | null;
};

// An entity label that is only its id ("account-521903353286118"): the Backend falls back to it.
const ENTITY_ID_SHAPE = /^(?:act_|(?:account|campaign|adset|ad|creative)[-_])?\d{6,}$/i;

const formatPeriod = (period: BlockProvenance['period']): string | null => {
  if (!period) return null;
  if (period.since && period.until) {
    return period.since === period.until ? period.since : `${period.since} → ${period.until}`;
  }
  return period.requested_label ?? null;
};

export function EvidenceTooltip({ provenance, datasetId, evidenceRefs }: EvidenceTooltipProps) {
  const descriptionId = useId();
  const text = PROVENANCE_TEXT[useAnswerLanguage()];
  // Older blocks predate structured provenance; a non-null dataset_id still
  // proves server-side materialization.
  const isComputed = provenance?.source === 'computed' || (!provenance && Boolean(datasetId));
  const period = formatPeriod(provenance?.period ?? null);

  const headline = isComputed ? text.computed : text.model;
  const detail = isComputed ? text.computedDetail : text.modelDetail;

  // `internal` facts are for checking in the hover panel: a tool name or an id is nothing to read.
  const facts: Array<{ label: string; value: string; internal?: boolean }> = [];
  if (provenance?.tool) facts.push({ label: text.source, value: provenance.tool, internal: true });
  if (period) facts.push({ label: text.period, value: period });
  if (provenance?.entity_label) {
    facts.push({
      label: text.entity,
      value: provenance.entity_label,
      internal: ENTITY_ID_SHAPE.test(provenance.entity_label),
    });
  }
  if (typeof provenance?.record_count === 'number') {
    facts.push({ label: text.records, value: String(provenance.record_count) });
  }
  if (evidenceRefs?.length) {
    facts.push({ label: text.references, value: String(evidenceRefs.length) });
  }
  const id = datasetId ?? null;
  const visibleEvidenceRefs = evidenceRefs?.slice(0, 5) ?? [];

  // Read on every focus of the ⓘ, so it says what the reader can use, in the answer's language.
  const srSummary = [
    headline,
    detail,
    ...facts.filter((f) => !f.internal).map((f) => `${f.label}: ${f.value}`),
  ].join('. ');

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={text.trigger}
              aria-describedby={descriptionId}
              className="inline-flex cursor-help items-center text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground"
            >
              <InfoIcon className="size-3.5" aria-hidden="true" />
            </button>
          }
        />
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm font-medium">{headline}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
          {facts.length > 0 ? (
            <dl className="mt-1.5 space-y-0.5">
              {facts.map((fact) => (
                <div key={fact.label} className="flex gap-1.5 text-xs">
                  <dt className="text-muted-foreground">{fact.label}:</dt>
                  <dd className="font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {visibleEvidenceRefs.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 font-mono text-xs text-muted-foreground/70">
              {visibleEvidenceRefs.map((ref) => (
                <li key={ref}>{ref}</li>
              ))}
            </ul>
          ) : null}
          {id ? <p className="mt-1.5 font-mono text-xs text-muted-foreground/70">{id}</p> : null}
        </TooltipContent>
      </Tooltip>
      <span id={descriptionId} className="sr-only">
        {srSummary}
      </span>
    </TooltipProvider>
  );
}
