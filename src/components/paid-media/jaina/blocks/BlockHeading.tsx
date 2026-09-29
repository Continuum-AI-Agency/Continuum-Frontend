'use client';

// Every block's heading, drawn once: the title at table size and semibold, with the id in
// it swapped for the entity's name when the report knows one (`entityNames.tsx`), and the
// provenance affordance beside it. Nine blocks each wrote this line with their own class
// string; they now share this one.

import type { BlockProvenance } from '@continuum/contracts';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { JAINA_TYPE } from '../reading';
import { EvidenceTooltip } from './EvidenceTooltip';
import { displayBlockTitle, useEntityNames } from './entityNames';

type BlockHeadingProps = {
  title: string;
  provenance?: BlockProvenance | null;
  datasetId?: string | null;
  evidenceRefs?: string[] | null;
  /** Drawn before the title (the actions block's calm rule). */
  leading?: ReactNode;
  className?: string;
};

export const BLOCK_TITLE_CLASS = `${JAINA_TYPE.table} font-semibold text-foreground`;

export function BlockHeading({
  title,
  provenance,
  datasetId,
  evidenceRefs,
  leading,
  className,
}: BlockHeadingProps) {
  const names = useEntityNames();
  const showTooltip =
    provenance !== undefined || datasetId !== undefined || evidenceRefs !== undefined;
  return (
    <div className={cn('mb-2 flex items-center gap-1.5', className)}>
      {leading}
      <h4 className={BLOCK_TITLE_CLASS}>{displayBlockTitle(title, names)}</h4>
      {showTooltip ? (
        <EvidenceTooltip
          provenance={provenance ?? null}
          datasetId={datasetId ?? null}
          evidenceRefs={evidenceRefs ?? undefined}
        />
      ) : null}
    </div>
  );
}
