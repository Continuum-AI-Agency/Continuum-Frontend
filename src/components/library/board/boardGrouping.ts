// Generalizes the Kanban from "the review board" to "a board over any field" —
// review_status, or ANY of the brand's custom fields. Choice-like fields (single and
// multi select, status, user, rating, checkbox) get one lane per choice and accept drops;
// value-like fields (date, number, text, url) are bucketed into lanes that only group —
// a lane like "Next 7 days" or "10 – 20" names a range, not a value a drop could write.
//
// review_status is NOT one of those custom fields and is never migrated into
// them: it carries an append-only audit trail, so a drop onto a review lane must
// post a review TRANSITION, while a drop onto a custom-field lane just writes a
// field value. The lane id is what keeps those two writes from being confused —
// it encodes which kind of lane it is, so `decodeLaneId` on the drop target tells
// the board exactly which call to make.

import type {
  CustomField,
  CustomFieldValue,
  MediaAsset,
  MediaReviewStatus,
  ReviewCustomState,
} from '@continuum/contracts';
import { customFieldChoiceOptions, mediaReviewStatusSchema } from '@continuum/contracts';
import { ratingMax } from '@/lib/library/customFields';
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
  /** A brand-chosen or status-stage colour, which overrides dotClass. */
  dotColor?: string | null;
  /** False for bucket lanes (date, number, text, url): a drop there has no value to write. */
  droppable: boolean;
  assets: MediaAsset[];
};

export type LaneTarget =
  | { kind: 'review_status'; status: MediaReviewStatus }
  // A brand custom state (media.review_custom_states) within its base status.
  | { kind: 'review_state'; status: MediaReviewStatus; stateId: string }
  | { kind: 'custom_field'; fieldId: string; optionId: string | null };

/** The lane for assets that hold no value for the grouping field. */
export const UNSET_LANE_KEY = '__unset';
export const UNSET_LANE_LABEL = 'Not set';

const REVIEW_PREFIX = 'review:';
const REVIEW_STATE_PREFIX = 'review-state:';
const FIELD_PREFIX = 'field:';

const UNSET_DOT = 'bg-muted-foreground/40';
const OPTION_DOT = 'bg-primary/60';

export function encodeLaneId(target: LaneTarget): string {
  if (target.kind === 'review_status') return `${REVIEW_PREFIX}${target.status}`;
  if (target.kind === 'review_state') {
    return `${REVIEW_STATE_PREFIX}${target.status}:${target.stateId}`;
  }
  return `${FIELD_PREFIX}${target.fieldId}:${target.optionId ?? UNSET_LANE_KEY}`;
}

export function decodeLaneId(laneId: string): LaneTarget | null {
  if (laneId.startsWith(REVIEW_STATE_PREFIX)) {
    const [status, stateId] = laneId.slice(REVIEW_STATE_PREFIX.length).split(':');
    const parsed = mediaReviewStatusSchema.safeParse(status);
    return parsed.success && stateId
      ? { kind: 'review_state', status: parsed.data, stateId }
      : null;
  }
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

/** The brand's own label + colour for a review state (media.review_state_labels). */
export type ReviewLaneLabels = Partial<Record<MediaReviewStatus, { label: string; color: string }>>;

export type BuildBoardLanesInput = {
  grouping: BoardGrouping;
  assets: readonly MediaAsset[];
  /**
   * assetId → the value it holds for the grouping field. Only consulted when grouping by a
   * custom field; an asset missing from the map lands in the unset lane.
   */
  valueByAssetId?: ReadonlyMap<string, CustomFieldValue>;
  /** The brand's members: a user field's lanes, one per member. */
  members?: readonly { userId: string; label: string }[];
  /** Brand labels for the review lanes; the product defaults fill any gap. */
  reviewLabels?: ReviewLaneLabels;
  /** The brand's custom states: each is its own lane right after its base lane. */
  customStates?: readonly ReviewCustomState[];
  /** "Today" for date buckets — injectable so the buckets are testable. */
  now?: Date;
};

const TEXT_LANE_LIMIT = 12;
const OTHER_LANE_KEY = '__other';
const DAY_MS = 86_400_000;

type LaneSpec = { key: string; label: string; color?: string | null };

function isEmpty(value: CustomFieldValue | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function dayIndex(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00.000Z`) / DAY_MS);
}

const DATE_BUCKETS: LaneSpec[] = [
  { key: 'overdue', label: 'Past' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'later', label: 'Later' },
];

function dateBucket(iso: string, now: Date): string {
  const days = dayIndex(iso) - Math.floor(now.getTime() / DAY_MS);
  if (Number.isNaN(days)) return OTHER_LANE_KEY;
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'week';
  return 'later';
}

// Four equal-width ranges over the values present; one lane when they are all equal.
function numberRanges(values: number[]): { lanes: LaneSpec[]; keyOf: (n: number) => string } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (values.length === 0 || min === max) {
    const label = values.length === 0 ? 'Any' : String(min);
    return { lanes: [{ key: 'r0', label }], keyOf: () => 'r0' };
  }
  const width = (max - min) / 4;
  const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString('en-US');
  const lanes = [0, 1, 2, 3].map((index) => ({
    key: `r${index}`,
    label: `${fmt(min + width * index)} – ${fmt(index === 3 ? max : min + width * (index + 1))}`,
  }));
  return { lanes, keyOf: (n) => `r${Math.min(3, Math.floor((n - min) / width))}` };
}

/** Lanes for one custom field plus the lane each stored value belongs to. */
function fieldLanes(
  field: CustomField,
  values: CustomFieldValue[],
  members: BuildBoardLanesInput['members'],
  now: Date,
): { lanes: LaneSpec[]; keyOf: (value: CustomFieldValue) => string | null } {
  switch (field.type) {
    case 'single_select':
    case 'status':
    case 'multi_select': {
      const options = customFieldChoiceOptions(field);
      const known = new Set(options.map((option) => option.id));
      return {
        lanes: options.map((option) => ({
          key: option.id,
          label: option.label,
          color: field.type === 'status' ? (option.color ?? null) : null,
        })),
        // A multi-select sits in the lane of its first option: a card is in one lane only.
        keyOf: (value) => {
          const id = Array.isArray(value) ? value[0] : value;
          return typeof id === 'string' && known.has(id) ? id : null;
        },
      };
    }
    case 'user':
      return {
        lanes: (members ?? []).map((member) => ({ key: member.userId, label: member.label })),
        keyOf: (value) => (typeof value === 'string' ? value : null),
      };
    case 'rating':
      return {
        lanes: Array.from({ length: ratingMax(field) }, (_, index) => ({
          key: String(index + 1),
          label: '★'.repeat(index + 1),
        })),
        keyOf: (value) => (typeof value === 'number' ? String(value) : null),
      };
    case 'checkbox':
      return {
        lanes: [
          { key: 'true', label: 'Yes' },
          { key: 'false', label: 'No' },
        ],
        keyOf: (value) => (value === true ? 'true' : 'false'),
      };
    case 'date':
      return {
        lanes: DATE_BUCKETS,
        keyOf: (value) => (typeof value === 'string' ? dateBucket(value, now) : null),
      };
    case 'number': {
      const numbers = values.filter((value): value is number => typeof value === 'number');
      const { lanes, keyOf } = numberRanges(numbers);
      return { lanes, keyOf: (value) => (typeof value === 'number' ? keyOf(value) : null) };
    }
    default: {
      // text / url: the most common values each get a lane, the long tail shares one.
      const counts = new Map<string, number>();
      for (const value of values) {
        if (typeof value === 'string') counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TEXT_LANE_LIMIT)
        .map(([value]) => value);
      const kept = new Set(top);
      const lanes: LaneSpec[] = top.map((value) => ({ key: value, label: value }));
      if (counts.size > kept.size) lanes.push({ key: OTHER_LANE_KEY, label: 'Other' });
      return {
        lanes,
        keyOf: (value) =>
          typeof value === 'string' ? (kept.has(value) ? value : OTHER_LANE_KEY) : null,
      };
    }
  }
}

/** Can a drop on this field's lanes write a value? Buckets only group. */
export function isDroppableField(field: CustomField): boolean {
  return !['date', 'number', 'text', 'url'].includes(field.type);
}

/**
 * The value a drop onto `laneKey` writes, given what the asset held. Null clears it (the
 * unset lane). A multi-select swaps the option it was grouped under for the new one and
 * keeps the rest; undefined means the lane cannot take a drop.
 */
export function dropValue(
  field: CustomField,
  laneKey: string | null,
  current: CustomFieldValue,
): CustomFieldValue | undefined {
  if (!isDroppableField(field)) return undefined;
  if (laneKey === null) return field.type === 'checkbox' ? false : null;
  switch (field.type) {
    case 'rating':
      return Number(laneKey);
    case 'checkbox':
      return laneKey === 'true';
    case 'multi_select': {
      const held = Array.isArray(current) ? current : [];
      const [grouped, ...rest] = held;
      if (grouped === laneKey) return held;
      return [laneKey, ...rest.filter((id) => id !== laneKey && id !== grouped)];
    }
    default:
      return laneKey;
  }
}

export function buildBoardLanes({
  grouping,
  assets,
  valueByAssetId,
  members,
  reviewLabels,
  customStates = [],
  now = new Date(),
}: BuildBoardLanesInput): BoardLane[] {
  if (grouping.kind === 'review_status') {
    const columns = groupAssetsByReviewStatus([...assets]);
    return REVIEW_STATUS_ORDER.flatMap((status) => {
      const own = customStates.filter((state) => state.baseStatus === status);
      // A card holding one of this base's custom states sits in that state's lane;
      // any other card (no state, or a deleted one) stays in the base lane.
      const inState = (asset: MediaAsset, stateId: string) => asset.reviewStateId === stateId;
      return [
        {
          id: encodeLaneId({ kind: 'review_status', status }),
          label: reviewLabels?.[status]?.label ?? REVIEW_STATUS_META[status].columnLabel,
          dotClass: REVIEW_STATUS_META[status].dotClass,
          dotColor: reviewLabels?.[status]?.color ?? null,
          droppable: true,
          assets: columns[status].filter((asset) => !own.some((state) => inState(asset, state.id))),
        },
        ...own.map((state) => ({
          id: encodeLaneId({ kind: 'review_state', status, stateId: state.id }),
          label: state.label,
          dotClass: REVIEW_STATUS_META[status].dotClass,
          dotColor: state.color,
          droppable: true,
          assets: columns[status].filter((asset) => inState(asset, state.id)),
        })),
      ];
    });
  }

  const { field } = grouping;
  const values = assets.map((asset) => valueByAssetId?.get(asset.id) ?? null);
  const { lanes: specs, keyOf } = fieldLanes(field, values, members, now);
  const droppable = isDroppableField(field);
  const unsetLabel = field.type === 'user' ? 'Unassigned' : UNSET_LANE_LABEL;
  // A checkbox has no third state: unchecked and never set are the same "No".
  const withUnset = field.type === 'checkbox' ? specs : [{ key: '', label: unsetLabel }, ...specs];
  const lanes: BoardLane[] = withUnset.map((spec) => ({
    id: encodeLaneId({
      kind: 'custom_field',
      fieldId: field.id,
      optionId: spec.key === '' ? null : spec.key,
    }),
    label: spec.label,
    dotClass: spec.key === '' ? UNSET_DOT : OPTION_DOT,
    dotColor: spec.color ?? null,
    droppable,
    assets: [],
  }));
  const laneByKey = new Map(withUnset.map((spec, index) => [spec.key, lanes[index] as BoardLane]));
  const unsetLane = laneByKey.get('') ?? (lanes[lanes.length - 1] as BoardLane);

  assets.forEach((asset, index) => {
    const value = values[index] ?? null;
    const key = isEmpty(value) && field.type !== 'checkbox' ? null : keyOf(value);
    // An id whose option was deleted, or a former member, reads as unset until re-saved.
    (key === null ? unsetLane : (laneByKey.get(key) ?? unsetLane)).assets.push(asset);
  });

  return lanes;
}
