'use client';

import type { ReactNode } from 'react';
import type { ScaffoldChoices, ScaffoldDerived } from '@/lib/paid-media/scaffoldTree';
import { targetingSummary } from '@/lib/paid-media/scaffoldTree';
import { DerivedValue } from './DerivedValue';

/**
 * What one scaffold node actually IS, for the hover on its canvas card.
 *
 * The canvas card itself can only carry a name, a count and a status pill — anything
 * more and a fifty-node tree becomes unreadable at any zoom. So the detail lives here,
 * one hover away, and this is the only place a reader learns what an ad set will
 * deliver and who it will reach.
 *
 * Rows are OMITTED when empty rather than rendered as an em-dash. A table column has to
 * hold its place across rows; a hover panel does not, and a panel of eight dashes reads
 * as "broken" where three real rows read as "this is what is decided so far". The one
 * exception is targeting on an ad set that names an audience group — see below.
 */

type DetailRow = { label: string; value: ReactNode; derived?: string };

function DetailRows({ rows }: { rows: DetailRow[] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words font-medium">
            {row.derived ? (
              <DerivedValue reason={row.derived}>{row.value}</DerivedValue>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const deliveryRows = (choices: ScaffoldChoices | undefined): DetailRow[] => {
  if (!choices) return [];
  return [
    ...(choices.objective ? [{ label: 'Objective', value: choices.objective }] : []),
    ...(choices.optimizationGoal
      ? [{ label: 'Optimizing for', value: choices.optimizationGoal }]
      : []),
    ...(choices.funnelStage ? [{ label: 'Funnel', value: choices.funnelStage }] : []),
    ...(choices.placement?.length
      ? [{ label: 'Placement', value: choices.placement.join(', ') }]
      : []),
  ];
};

/**
 * The audience rows.
 *
 * When a group is attached but its targeting has not compiled, this says so IN WORDS
 * instead of omitting the row. That state is the whole reason the propose gate does not
 * refuse an unpublished audience: a reviewer has to be able to see, before approving,
 * that an ad set points at a group Meta cannot deliver to yet.
 */
const audienceRows = (derived: ScaffoldDerived | undefined): DetailRow[] => {
  if (!derived) return [];
  const summary = targetingSummary(derived.targeting);
  if (summary) {
    return [
      {
        label: 'Audience',
        value: summary,
        derived: 'Compiled from the audience group this ad set points at.',
      },
    ];
  }
  if (derived.audienceGroupVersionId) {
    return [
      {
        label: 'Audience',
        value: 'Group attached, targeting not compiled yet',
        derived:
          'Its audiences are not published to Meta yet, so no targeting could be compiled. ' +
          'The build step will refuse until they are.',
      },
    ];
  }
  return [];
};

const idRow = (label: string, id: string | null | undefined): DetailRow[] =>
  id ? [{ label, value: <span className="font-mono text-[11px]">{id}</span> }] : [];

export type ScaffoldCampaignDetail = {
  choices?: ScaffoldChoices;
  derived?: ScaffoldDerived;
  adSetCount: number;
  adCount: number;
  metaObjectId?: string | null;
};

export function ScaffoldCampaignDetail({ data }: { data: ScaffoldCampaignDetail }) {
  return (
    <DetailRows
      rows={[
        ...deliveryRows(data.choices),
        { label: 'Contains', value: `${data.adSetCount} ad sets · ${data.adCount} ads` },
        ...(data.derived?.specialAdCategories?.length
          ? [
              {
                label: 'Special category',
                value: data.derived.specialAdCategories.join(', '),
                derived: 'Declared on the scaffold version; it cannot vary per node.',
              },
            ]
          : []),
        ...idRow('Meta id', data.metaObjectId),
      ]}
    />
  );
}

export type ScaffoldAdSetDetail = {
  productKey?: string | null;
  angleKey?: string | null;
  choices?: ScaffoldChoices;
  derived?: ScaffoldDerived;
  adCount: number;
  metaObjectId?: string | null;
  errorMessage?: string | null;
};

export function ScaffoldAdSetDetail({ data }: { data: ScaffoldAdSetDetail }) {
  return (
    <div className="flex flex-col gap-2">
      <DetailRows
        rows={[
          ...(data.productKey ? [{ label: 'Product', value: data.productKey }] : []),
          ...(data.angleKey ? [{ label: 'Angle', value: data.angleKey }] : []),
          ...deliveryRows(data.choices),
          ...audienceRows(data.derived),
          { label: 'Ads', value: String(data.adCount) },
          ...idRow('Meta id', data.metaObjectId),
        ]}
      />
      {data.errorMessage ? <p className="text-destructive text-xs">{data.errorMessage}</p> : null}
    </div>
  );
}

export type ScaffoldAdDetail = {
  conceptKey?: string | null;
  productKey?: string | null;
  angleKey?: string | null;
  choices?: ScaffoldChoices;
  derived?: ScaffoldDerived;
  metaCreativeId?: string | null;
  creativeAssetId?: string | null;
  creativeMedia?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

/** `creative_media` is Meta's upload receipt: `{ kind, video_id, image_hash, ... }`. */
const creativeLabel = (media: Record<string, unknown> | null | undefined): string | null => {
  if (!media) return null;
  const kind = typeof media.kind === 'string' ? media.kind : null;
  return kind ? `${kind} uploaded to Meta` : 'uploaded to Meta';
};

export function ScaffoldAdDetail({ data }: { data: ScaffoldAdDetail }) {
  const creative =
    creativeLabel(data.creativeMedia) ?? (data.creativeAssetId ? 'attached, not uploaded' : null);

  return (
    <div className="flex flex-col gap-2">
      <DetailRows
        rows={[
          ...(data.conceptKey ? [{ label: 'Concept', value: data.conceptKey }] : []),
          ...(data.productKey ? [{ label: 'Product', value: data.productKey }] : []),
          ...(data.angleKey ? [{ label: 'Angle', value: data.angleKey }] : []),
          {
            label: 'Creative',
            value: creative ?? 'Not attached yet',
            ...(creative ? {} : { derived: 'Attach one before the populate step.' }),
          },
          // Delivery is the ad set's, repeated here so a reader hovering an ad does not
          // have to go back up a level to learn who sees it.
          ...deliveryRows(data.choices),
          ...audienceRows(data.derived),
          ...idRow('Creative id', data.metaCreativeId),
        ]}
      />
      {data.errorMessage ? <p className="text-destructive text-xs">{data.errorMessage}</p> : null}
    </div>
  );
}
