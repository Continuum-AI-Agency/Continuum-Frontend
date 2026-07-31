'use client';

import type { ScaffoldAdSetRow } from '@/lib/paid-media/scaffoldTree';
import { DerivedValue } from './DerivedValue';
import { ScaffoldStatusPill } from './ScaffoldStatusPill';

/**
 * The ads inside one ad set, rendered in the expanded row.
 *
 * A plain list, not a nested InsightDataTable: a <table> inside a <td> inside a
 * sticky-header <tbody> fights the outer table's layout for no gain at three rows.
 */
export function ScaffoldAdList({ adSet }: { adSet: ScaffoldAdSetRow }) {
  if (adSet.ads.length === 0) {
    return (
      <p className="px-1 py-2 text-muted-foreground text-sm">
        No ads in this ad set yet — they are created at the populate gate.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1 py-1">
      {adSet.ads.map((ad) => (
        <li
          key={ad.pathKey}
          className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-muted/30"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <DerivedValue
              className="truncate"
              reason="Composed from your ad-naming schema, like the ad set name."
            >
              {ad.name}
            </DerivedValue>
            {ad.errorMessage ? (
              <span className="truncate text-destructive text-xs" title={ad.errorMessage}>
                {ad.errorMessage}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {ad.conceptKey ? (
              <span className="text-muted-foreground text-xs">{ad.conceptKey}</span>
            ) : null}
            <ScaffoldStatusPill status={ad.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
