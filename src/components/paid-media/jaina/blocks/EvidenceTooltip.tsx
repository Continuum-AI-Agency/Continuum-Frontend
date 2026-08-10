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
};

const formatPeriod = (period: BlockProvenance['period']): string | null => {
  if (!period) return null;
  if (period.since && period.until) {
    return period.since === period.until ? period.since : `${period.since} → ${period.until}`;
  }
  return period.requested_label ?? null;
};

export function EvidenceTooltip({ provenance, datasetId }: EvidenceTooltipProps) {
  const descriptionId = useId();
  // Older blocks predate structured provenance; a non-null dataset_id still
  // proves server-side materialization.
  const isComputed = provenance?.source === 'computed' || (!provenance && Boolean(datasetId));
  const period = formatPeriod(provenance?.period ?? null);

  const headline = isComputed ? 'Verified data' : 'Model-authored';
  const detail = isComputed
    ? 'Values filled in server-side, verbatim from data fetched from the ad platform during this analysis — not typed by the AI.'
    : 'This block was written by the AI from the evidence it gathered. Cross-check important figures against the source data.';

  const facts: Array<{ label: string; value: string }> = [];
  if (provenance?.tool) facts.push({ label: 'Source', value: provenance.tool });
  if (period) facts.push({ label: 'Data period', value: period });
  if (provenance?.entity_label) facts.push({ label: 'Entity', value: provenance.entity_label });
  if (typeof provenance?.record_count === 'number') {
    facts.push({ label: 'Records', value: String(provenance.record_count) });
  }
  const id = datasetId ?? null;

  const srSummary = [headline, detail, ...facts.map((f) => `${f.label}: ${f.value}`)].join('. ');

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Data provenance"
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
          {id ? (
            <p className="mt-1.5 font-mono text-[10px] text-muted-foreground/70">{id}</p>
          ) : null}
        </TooltipContent>
      </Tooltip>
      <span id={descriptionId} className="sr-only">
        {srSummary}
      </span>
    </TooltipProvider>
  );
}
