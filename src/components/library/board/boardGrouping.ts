// Generalizes the Kanban from "the review board" to "a board over any
// single-select dimension" — review_status, or one of the brand's custom
// single-select fields.
//
// review_status is NOT one of those custom fields and is never migrated into
// them: it carries an append-only audit trail, so a drop onto a review lane must
// post a review TRANSITION, while a drop onto a custom-field lane just writes a
// field value. The lane id is what keeps those two writes from being confused —
// it encodes which kind of lane it is, so `decodeLaneId` on the drop target tells
// the board exactly which call to make.

import type { CustomField, MediaAsset, MediaReviewStatus } from '@continuum/contracts';
import { mediaReviewStatusSchema } from '@continuum/contracts';
import { REVIEW_STATUS_META, REVIEW_STATUS_ORDER } from '@/lib/library/reviewStatus';
import { groupAssetsByReviewStatus } from './groupAssetsByReviewStatus';

export type BoardGrouping =
  | { kind: 'review_status' }
  | { kind: 'custom_field'; field: CustomField };

export type BoardLane = {
  /** dnd-kit droppable id; decodes back into the write a drop must perform. */
  id: string;
  label: string;
  /** Tailwind class for the lane's header dot. */
  dotClass: string;
  assets: MediaAsset[];
};

export type LaneTarget =
  | { kind: 'review_status'; status: MediaReviewStatus }
  | { kind: 'custom_field'; fieldId: string; optionId: string | null };

/** The lane for assets that hold no value for the grouping field. */
export const UNSET_LANE_KEY = '__unset';
export const UNSET_LANE_LABEL = 'Not set';

const REVIEW_PREFIX = 'review:';
const FIELD_PREFIX = 'field:';

const UNSET_DOT = 'bg-muted-foreground/40';
const OPTION_DOT = 'bg-primary/60';

export function encodeLaneId(target: LaneTarget): string {
  if (target.kind === 'review_status') return `${REVIEW_PREFIX}${target.status}`;
  return `${FIELD_PREFIX}${target.fieldId}:${target.optionId ?? UNSET_LANE_KEY}`;
}

export function decodeLaneId(laneId: string): LaneTarget | null {
  if (laneId.startsWith(REVIEW_PREFIX)) {
    const parsed = mediaReviewStatusSchema.safeParse(laneId.slice(REVIEW_PREFIX.length));
    return parsed.success ? { kind: 'review_status', status: parsed.data } : null;
  }
  if (!laneId.startsWith(FIELD_PREFIX)) return null;
  const rest = laneId.slice(FIELD_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator <= 0) return null;
  const fieldId = rest.slice(0, separator);
  // Option ids are opaque strings and may themselves contain a colon, so only
  // the FIRST separator is structural.
  const optionId = rest.slice(separator + 1);
  if (optionId.length === 0) return null;
  return {
    kind: 'custom_field',
    fieldId,
    optionId: optionId === UNSET_LANE_KEY ? null : optionId,
  };
}

export type BuildBoardLanesInput = {
  grouping: BoardGrouping;
  assets: readonly MediaAsset[];
  /**
   * assetId → the option id it holds for the grouping field. Only consulted when
   * grouping by a custom field; an asset missing from the map (or holding an
   * option the field no longer defines) lands in the "Not set" lane.
   */
  optionByAssetId?: ReadonlyMap<string, string | null>;
};

export function buildBoardLanes({
  grouping,
  assets,
  optionByAssetId,
}: BuildBoardLanesInput): BoardLane[] {
  if (grouping.kind === 'review_status') {
    const columns = groupAssetsByReviewStatus([...assets]);
    return REVIEW_STATUS_ORDER.map((status) => ({
      id: encodeLaneId({ kind: 'review_status', status }),
      label: REVIEW_STATUS_META[status].columnLabel,
      dotClass: REVIEW_STATUS_META[status].dotClass,
      assets: columns[status],
    }));
  }

  const { field } = grouping;
  const lanes: BoardLane[] = [
    {
      id: encodeLaneId({ kind: 'custom_field', fieldId: field.id, optionId: null }),
      label: UNSET_LANE_LABEL,
      dotClass: UNSET_DOT,
      assets: [],
    },
    ...field.options.map((option) => ({
      id: encodeLaneId({ kind: 'custom_field', fieldId: field.id, optionId: option.id }),
      label: option.label,
      dotClass: OPTION_DOT,
      assets: [] as MediaAsset[],
    })),
  ];

  const laneByOptionId = new Map(
    field.options.map((option, index) => [option.id, lanes[index + 1] as BoardLane] as const),
  );

  for (const asset of assets) {
    const optionId = optionByAssetId?.get(asset.id) ?? null;
    // An id whose option was deleted has no lane — it reads as unset until the
    // asset is re-saved, which is what the contract promises.
    const lane = optionId ? laneByOptionId.get(optionId) : undefined;
    (lane ?? (lanes[0] as BoardLane)).assets.push(asset);
  }

  return lanes;
}
