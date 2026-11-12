'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useUiErrorMessage } from '@/i18n/errors';
import type { ScaffoldChoices, ScaffoldDerived } from '@/lib/paid-media/scaffoldTree';
import { targetingSummary } from '@/lib/paid-media/scaffoldTree';
import { DerivedValue } from './DerivedValue';
import { localizeScaffoldCopy, scaffoldChoiceLabel } from './scaffoldPlanView';

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
  const t = useTranslations('scale');
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{localizeScaffoldCopy(row.label, t)}</dt>
          <dd className="min-w-0 break-words font-medium">
            {row.derived ? (
              <DerivedValue reason={localizeScaffoldCopy(row.derived, t)}>{row.value}</DerivedValue>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const deliveryRows = (
  choices: ScaffoldChoices | undefined,
  t: ReturnType<typeof useTranslations<'scale'>>,
): DetailRow[] => {
  if (!choices) return [];
  return [
    ...(choices.objective
      ? [{ label: 'Objective', value: scaffoldChoiceLabel(choices.objective, t) }]
      : []),
    ...(choices.optimizationGoal
      ? [{ label: 'Optimizing for', value: scaffoldChoiceLabel(choices.optimizationGoal, t) }]
      : []),
    ...(choices.funnelStage
      ? [{ label: 'Funnel', value: scaffoldChoiceLabel(choices.funnelStage, t) }]
      : []),
    ...(choices.placement?.length
      ? [
          {
            label: 'Placement',
            value: choices.placement.map((value) => scaffoldChoiceLabel(value, t)).join(', '),
          },
        ]
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
const audienceRows = (
  derived: ScaffoldDerived | undefined,
  t: ReturnType<typeof useTranslations<'scale'>>,
  locale: ReturnType<typeof useLocale>,
): DetailRow[] => {
  if (!derived) return [];
  const summary = targetingSummary(derived.targeting, t, locale);
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
        value: localizeScaffoldCopy('Group attached, targeting not compiled yet', t),
        derived:
          'Its audiences are not published to Meta yet, so no targeting could be compiled. ' +
          'The build step will refuse until they are.',
      },
    ];
  }
  return [];
};

const idRow = (label: string, id: string | null | undefined): DetailRow[] =>
  id ? [{ label, value: <span className="font-mono text-xs">{id}</span> }] : [];

export type ScaffoldCampaignDetail = {
  choices?: ScaffoldChoices;
  derived?: ScaffoldDerived;
  adSetCount: number;
  adCount: number;
  metaObjectId?: string | null;
};

export function ScaffoldCampaignDetail({ data }: { data: ScaffoldCampaignDetail }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const uiError = useUiErrorMessage();
  return (
    <DetailRows
      rows={[
        ...deliveryRows(data.choices, uiText),
        {
          label: uiText('contains_2eaecb3'),
          value: uiText('scaffoldNodeCounts', { sets: data.adSetCount, ads: data.adCount }),
        },
        ...(data.derived?.specialAdCategories?.length
          ? [
              {
                label: uiText('special_category_5beb3eb'),
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const uiError = useUiErrorMessage();
  return (
    <div className="flex flex-col gap-2">
      <DetailRows
        rows={[
          ...(data.productKey
            ? [{ label: uiText('product_fb9ef89'), value: data.productKey }]
            : []),
          ...(data.angleKey ? [{ label: uiText('angle_1968034'), value: data.angleKey }] : []),
          ...deliveryRows(data.choices, uiText),
          ...audienceRows(data.derived, uiText, uiLocale),
          { label: uiText('ads_9210f3b'), value: data.adCount.toLocaleString(uiLocale) },
          ...idRow('Meta id', data.metaObjectId),
        ]}
      />
      {data.errorMessage ? (
        <p className="text-destructive text-xs">{uiError(data.errorMessage)}</p>
      ) : null}
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
const creativeLabel = (
  media: Record<string, unknown> | null | undefined,
  t: ReturnType<typeof useTranslations<'scale'>>,
): string | null => {
  if (!media) return null;
  const kind = typeof media.kind === 'string' ? media.kind : null;
  return t('scaffoldCreativeUploaded', { kind: kind ?? 'other' });
};

export function ScaffoldAdDetail({ data }: { data: ScaffoldAdDetail }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const uiError = useUiErrorMessage();
  const creative =
    creativeLabel(data.creativeMedia, uiText) ??
    (data.creativeAssetId ? localizeScaffoldCopy('attached, not uploaded', uiText) : null);

  return (
    <div className="flex flex-col gap-2">
      <DetailRows
        rows={[
          ...(data.conceptKey
            ? [{ label: uiText('concept_54287be'), value: data.conceptKey }]
            : []),
          ...(data.productKey
            ? [{ label: uiText('product_fb9ef89'), value: data.productKey }]
            : []),
          ...(data.angleKey ? [{ label: uiText('angle_1968034'), value: data.angleKey }] : []),
          {
            label: uiText('creative_2c7e633'),
            value: creative ?? localizeScaffoldCopy('Not attached yet', uiText),
            ...(creative ? {} : { derived: 'Attach one before the populate step.' }),
          },
          // Delivery is the ad set's, repeated here so a reader hovering an ad does not
          // have to go back up a level to learn who sees it.
          ...deliveryRows(data.choices, uiText),
          ...audienceRows(data.derived, uiText, uiLocale),
          ...idRow('Creative id', data.metaCreativeId),
        ]}
      />
      {data.errorMessage ? (
        <p className="text-destructive text-xs">{uiError(data.errorMessage)}</p>
      ) : null}
    </div>
  );
}
