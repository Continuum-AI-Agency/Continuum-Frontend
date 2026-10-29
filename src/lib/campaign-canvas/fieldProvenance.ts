/**
 * Who supplied each field of a scaffold node — 'user_gave', 'jaina_filled', 'jaina_asks' —
 * as the canvas keeps it and the save sends it.
 *
 * MARKED AT THE EDIT, NOT DIFFED AT THE SAVE. A save that compared the canvas against the
 * stored row would call every changed field the person's, including the ones Jaina changed
 * on the canvas from the chat (`JainaChatSurface` writes node data through the same store).
 * Only a person-facing control knows a person did it, so each one passes its patch through
 * `withUserGave`, and the save sends what the node carries. Presentation only: the label is
 * stored on the node row and never enters the content hash an approval covers.
 */

import {
  type FieldProvenance,
  PAID_SCAFFOLD_PROVENANCE_KEYS,
  type PaidScaffoldDraftNode,
} from '@continuum/contracts';
import type { CanvasFieldProvenance, MetaCampaignNodeType } from '@/CampaignCanvas/types';

/**
 * Which draft-node keys a canvas field writes, per node type. One canvas field can write
 * several keys (placement), and an audience / creative node writes its ONE marker key, which
 * the save reads off onto the ad set / ad it feeds.
 */
const DRAFT_KEYS: Record<MetaCampaignNodeType, Record<string, readonly string[]>> = {
  campaign: {
    label: ['name'],
    objective: ['objective'],
    specialAdCategories: ['special_ad_categories'],
    budgetMode: ['budget_mode'],
    campaignBudgetAmount: ['campaign_daily_budget_minor_units'],
    bidStrategy: ['bid_strategy'],
    bidAmount: ['bid_amount_minor_units'],
    roasFloor: ['roas_floor'],
  },
  'ad-set': {
    label: ['name'],
    funnelStage: ['funnel_stage'],
    optimizationGoal: ['optimization_goal'],
    budgetAmount: ['daily_budget_minor_units'],
    bidStrategy: ['bid_strategy'],
    bidAmount: ['bid_amount_minor_units'],
    roasFloor: ['roas_floor'],
    startTime: ['start_time'],
    endTime: ['end_time'],
    customEventType: ['custom_event_type'],
    pixelId: ['pixel_id'],
    placementMode: ['placement_mode'],
    publisherPlatforms: ['publisher_platforms'],
    facebookPositions: ['facebook_positions'],
    instagramPositions: ['instagram_positions'],
    devicePlatforms: ['device_platforms'],
  },
  ad: {
    label: ['name'],
    primaryText: ['message'],
    headline: ['headline'],
    description: ['description'],
    callToAction: ['call_to_action_type'],
    linkUrl: ['link'],
    urlTags: ['url_tags'],
  },
  audience: {},
  creative: {},
};

/** The one key an audience / creative node carries: what its ad set / ad reads at save. */
export const AUDIENCE_MARK = 'audience';
export const CREATIVE_MARK = 'creative';

const MARK_FOR_WHOLE_NODE: Partial<Record<MetaCampaignNodeType, string>> = {
  audience: AUDIENCE_MARK,
  creative: CREATIVE_MARK,
};

const sameValue = (left: unknown, right: unknown): boolean =>
  Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);

/**
 * A person's patch, plus the provenance it implies. A patch that changes nothing comes back
 * as given, and one whose keys are already the person's keeps the SAME provenance object — the
 * store compares values by identity, and a fresh object would be an undo step for no edit.
 */
export function withUserGave<T extends Record<string, unknown>>(
  type: MetaCampaignNodeType,
  current: Record<string, unknown>,
  patch: T,
): T & { fieldProvenance?: CanvasFieldProvenance } {
  const changed = Object.keys(patch).filter((key) => !sameValue(current[key], patch[key]));
  const wholeNode = MARK_FOR_WHOLE_NODE[type];
  const keys = wholeNode
    ? changed.length > 0
      ? [wholeNode]
      : []
    : changed.flatMap((key) => DRAFT_KEYS[type][key] ?? []);
  const recorded = (current.fieldProvenance ?? {}) as CanvasFieldProvenance;
  const fresh = keys.filter((key) => recorded[key] !== 'user_gave');
  if (fresh.length === 0) return patch;
  const next: CanvasFieldProvenance = { ...recorded };
  for (const key of fresh) next[key] = 'user_gave';
  return { ...patch, fieldProvenance: next };
}

const isSet = (value: unknown): boolean => value !== null && value !== undefined;

/**
 * The `field_provenance` one draft node is saved with, in the contract's key order —
 * jsonb hands keys back in its own order, so a canonical order is what lets a save of a
 * hydrated, untouched canvas reproduce the stored map byte for byte.
 *
 * `drawn` is a node with no row behind it: everything it holds, a person put there.
 * `userKeys` are keys a person gave through ANOTHER node (an edited audience is its ad set's
 * targeting). Null when nothing is known, the same "no record" an older row carries.
 */
export function draftFieldProvenance(params: {
  level: PaidScaffoldDraftNode['level'];
  draft: Partial<Record<keyof PaidScaffoldDraftNode, unknown>>;
  recorded: CanvasFieldProvenance | null | undefined;
  drawn: boolean;
  userKeys?: readonly string[];
}): Record<string, FieldProvenance> | null {
  const { level, draft, recorded, drawn, userKeys = [] } = params;
  const result: Record<string, FieldProvenance> = {};
  for (const key of PAID_SCAFFOLD_PROVENANCE_KEYS[level]) {
    const value = draft[key];
    const label = (drawn && isSet(value)) || userKeys.includes(key) ? 'user_gave' : recorded?.[key];
    if (label) result[key] = label;
  }
  return Object.keys(result).length > 0 ? result : null;
}
