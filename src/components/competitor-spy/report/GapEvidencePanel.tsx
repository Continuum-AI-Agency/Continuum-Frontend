'use client';

// Per-gap evidence drill-down: competitor exemplars on the left, the brand's
// own ads carrying the (matched) value on the right — or an honest empty note
// when the brand runs nothing there.

import type {
  CompetitiveGapReport,
  CompetitiveGapRow,
  GapOwnAdExemplar,
} from '@continuum/contracts';
import { CompetitorExemplarStrip } from './CompetitorExemplarCard';
import { money } from './gapPresentation';

export function GapEvidencePanel({
  row,
  exemplars,
}: {
  row: CompetitiveGapRow;
  exemplars: CompetitiveGapReport['exemplars'];
}) {
  const competitorExemplars = row.competitorEvidence.exemplarSnapshotIds
    .slice(0, 3)
    .map((snapshotId) => exemplars.competitor[snapshotId])
    .filter((exemplar) => Boolean(exemplar));

  const ownExemplars = (row.ownEvidence?.exemplarAdIds ?? [])
    .slice(0, 3)
    .map((adId) => exemplars.own[adId])
    .filter((exemplar): exemplar is GapOwnAdExemplar => Boolean(exemplar));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          What they&apos;re running
        </p>
        <CompetitorExemplarStrip exemplars={competitorExemplars} />
      </div>

      <div className="space-y-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Your ads here
        </p>
        {row.ownEvidence === null || ownExemplars.length === 0 ? (
          <p className="text-xs text-muted-foreground">No ads of yours carry this angle yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {ownExemplars.map((ad) => (
              <OwnAdRow ad={ad} key={ad.adId} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OwnAdRow({ ad }: { ad: GapOwnAdExemplar }) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
      {ad.thumbnailUrl ? (
        <img
          alt={ad.adName ?? 'Ad thumbnail'}
          className="size-9 shrink-0 rounded object-cover"
          loading="lazy"
          src={ad.thumbnailUrl}
        />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded bg-muted text-3xs text-muted-foreground">
          AD
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">
            {ad.adName ?? ad.adId}
          </span>
          {ad.funnelStage ? (
            <span className="rounded bg-muted px-1 py-px text-3xs uppercase text-muted-foreground">
              {ad.funnelStage}
            </span>
          ) : null}
        </span>
        <span className="block text-3xs text-muted-foreground">{money(ad.spendD30)} 30d spend</span>
      </span>
      {ad.permalinkUrl ? (
        <a
          className="shrink-0 text-2xs font-medium text-primary hover:underline"
          href={ad.permalinkUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open in Meta
        </a>
      ) : null}
    </li>
  );
}
