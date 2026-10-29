/**
 * The Campaign Canvas graph → a NEW scaffold version, through the Backend's save route.
 *
 * The canvas saves in the same flat vocabulary Jaina proposes in
 * (`paidScaffoldVersionSaveRequestSchema`), so one compiler validates both: the audience rule,
 * Meta's budget floor, the promoted object and the evidence all run server-side on the saved
 * nodes, and the version that comes back carries its own content hash. Nothing here decides
 * what is valid on Meta — it translates the graph and lets the compiler refuse by name.
 *
 * Audiences and creatives are not nodes on the wire: an audience becomes its ad set's
 * `audience_group_version_id` / `broad_targeting`, a creative becomes its ad's `creative`.
 * Keys no node edits (product/angle/concept, funnel stage, placement) are carried from the
 * version's own rows, so a save round-trips everything a person did not touch.
 */

import {
  PAID_SCAFFOLD_AUTOPILOT_SCOPES_OFF,
  PAID_SCAFFOLD_BID_STRATEGIES,
  PAID_SCAFFOLD_CAPPED_BID_STRATEGIES,
  type PaidScaffoldBidStrategy,
  type PaidScaffoldBroadTargeting,
  type PaidScaffoldCreative,
  type PaidScaffoldDraftNode,
  type PaidScaffoldVersionSaveRequest,
  type PaidScaffoldVersionSaveResponse,
  paidScaffoldCopiedAudienceSaveIssue,
  paidScaffoldFullFieldIssues,
  paidScaffoldVersionSaveErrorSchema,
  paidScaffoldVersionSaveRequestSchema,
  paidScaffoldVersionSaveResponseSchema,
  toMinorUnits,
} from '@continuum/contracts';
import type {
  AdData,
  AdSetData,
  AudienceData,
  CampaignCanvasEdge,
  CampaignCanvasNode,
  CampaignData,
  CreativeData,
} from '@/CampaignCanvas/types';
import { collectOrphanNodes } from '@/CampaignCanvas/validation/orphanRelationships';
import { ApiError } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import type { PaidScaffoldNodeRow } from '@/lib/paid-media/scaffoldTree';
import { AUDIENCE_MARK, CREATIVE_MARK, draftFieldProvenance } from './fieldProvenance';
import type { CanvasHydration } from './hydrate';

/** A save the canvas cannot even send, named per node so the person can fix it. */
export class CanvasSaveError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = 'CanvasSaveError';
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const asStrings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? (value as string[])
    : null;

/** A key a new node can be named by: lower-case, underscores, nothing Meta would trip on. */
const slug = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .slice(0, 60) || 'untitled';

/**
 * The ONE link rule — the inspector marks a field invalid by it and the save refuses by it, so a
 * link the inspector accepted is never dropped on the way out. http(s) only.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** A link field: blank is "not set"; anything else must be http(s) or the save names it. */
const linkOf = (value: string | undefined, field: string, issues: string[]): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!isHttpUrl(trimmed)) {
    issues.push(`${field} "${trimmed}" is not an http(s) link.`);
    return null;
  }
  return trimmed;
};

const text = (value: string | undefined, max: number): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/** Canvas order: what the record called it first, then left-to-right as drawn. */
const byCanvasOrder = (a: CampaignCanvasNode, b: CampaignCanvasNode): number => {
  const keyA = a.data.provenance?.pathKey;
  const keyB = b.data.provenance?.pathKey;
  if (keyA && keyB && keyA !== keyB) return keyA.localeCompare(keyB, 'en', { numeric: true });
  if (keyA && !keyB) return -1;
  if (!keyA && keyB) return 1;
  return a.position.x - b.position.x;
};

const GENDER_BY_CODE: Record<number, 'male' | 'female'> = { 1: 'male', 2: 'female' };

export const broadTargetingOf = (audience: AudienceData): PaidScaffoldBroadTargeting => {
  const genders = [
    ...new Set((audience.genders ?? []).map((code) => GENDER_BY_CODE[code]).filter(Boolean)),
  ] as ('male' | 'female')[];
  return {
    countries: [
      ...new Set(
        audience.locations
          .map((code) => code.trim().toUpperCase())
          .filter((code) => /^[A-Z]{2}$/.test(code)),
      ),
    ],
    age_min: Math.min(65, Math.max(18, audience.ageMin ?? 18)),
    age_max: Math.min(65, Math.max(18, audience.ageMax ?? 65)),
    // Both genders is the same audience as "all" — Meta reads null as all.
    genders: genders.length === 0 || genders.length === 2 ? null : genders,
  };
};

export const creativeOf = (
  creative: CreativeData | undefined,
  issues: string[] = [],
): PaidScaffoldCreative | null => {
  if (!creative) return null;
  if (creative.assetType === 'carousel') {
    const cards = (creative.cards ?? []).map((card, index) => ({
      asset_id: card.mediaId,
      headline: text(card.headline, 255),
      link: linkOf(card.linkUrl, `${creative.label}: card ${index + 1} link`, issues),
    }));
    return cards.length > 0 ? { format: 'carousel', cards } : null;
  }
  if (!creative.mediaId) return null;
  return {
    format: creative.assetType,
    cards: [{ asset_id: creative.mediaId, headline: null, link: null }],
  };
};

const EMPTY_NODE: Omit<
  PaidScaffoldDraftNode,
  'path_key' | 'parent_path_key' | 'level' | 'ordinal' | 'name'
> = {
  product_key: null,
  angle_key: null,
  concept_key: null,
  objective: null,
  special_ad_categories: null,
  optimization_goal: null,
  funnel_stage: null,
  placement_mode: null,
  publisher_platforms: null,
  facebook_positions: null,
  instagram_positions: null,
  device_platforms: null,
  audience_group_version_id: null,
  broad_targeting: null,
  daily_budget_minor_units: null,
  target_conversions_per_day: null,
  link: null,
  message: null,
  headline: null,
  description: null,
  call_to_action_type: null,
  creative: null,
  budget_mode: null,
  campaign_daily_budget_minor_units: null,
  bid_strategy: null,
  bid_amount_minor_units: null,
  roas_floor: null,
  start_time: null,
  end_time: null,
  custom_event_type: null,
  pixel_id: null,
  url_tags: null,
  field_provenance: null,
};

/**
 * The canvas value when the node holds the key, else the row's. `undefined` is a node hydrated
 * (or persisted) before the field was editable — the same fallback `placementOf` makes; `null`
 * is a person clearing it, and is sent as null.
 */
const kept = <T>(edited: T | null | undefined, stored: T | null | undefined): T | null =>
  edited === undefined ? (stored ?? null) : edited;

/** A MAJOR-unit amount on the canvas as the minor units Meta takes; blank or <= 0 is unset. */
const minorOf = (amount: number | null | undefined, currency: string | null | undefined) =>
  typeof amount === 'number' && Number.isFinite(amount) && amount > 0
    ? toMinorUnits(amount, currency)
    : null;

/** An amount the person edited, else the row's minor units as stored. */
const keptMinor = (
  edited: number | null | undefined,
  stored: number | null | undefined,
  currency: string | null | undefined,
): number | null => (edited === undefined ? (stored ?? null) : minorOf(edited, currency));

const asBidStrategy = (value: unknown): PaidScaffoldBidStrategy | null =>
  PAID_SCAFFOLD_BID_STRATEGIES.includes(value as PaidScaffoldBidStrategy)
    ? (value as PaidScaffoldBidStrategy)
    : null;

const isCapped = (strategy: PaidScaffoldBidStrategy | null): boolean =>
  strategy !== null && PAID_SCAFFOLD_CAPPED_BID_STRATEGIES.includes(strategy);

type BidKeys = Pick<
  PaidScaffoldDraftNode,
  'bid_strategy' | 'bid_amount_minor_units' | 'roas_floor'
>;

const NO_BID: BidKeys = { bid_strategy: null, bid_amount_minor_units: null, roas_floor: null };

/** The bid a campaign (under CBO) or an ad set (under ABO) holds, as the canvas shows it. */
const bidOf = (
  data: CampaignData | AdSetData,
  row: PaidScaffoldNodeRow | undefined,
  currency: string | null | undefined,
): BidKeys => ({
  bid_strategy: asBidStrategy(kept(data.bidStrategy, row?.bidStrategy)),
  bid_amount_minor_units: keptMinor(data.bidAmount, row?.bidAmountMinorUnits, currency),
  roas_floor: kept(data.roasFloor, row?.roasFloor),
});

/** Free text a person may clear: blank is "not set". */
const keptText = (edited: string | null | undefined, stored: string | null | undefined) => {
  const value = kept(edited, stored);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

/**
 * The campaign's P5 keys. Under ABO (the default) it holds no budget and no bid, whatever a
 * hidden field still holds from before the switch — the inspector only shows those under CBO,
 * so a value nobody can see must not be what refuses the save.
 */
export const campaignFieldsOf = (
  data: CampaignData,
  row: PaidScaffoldNodeRow | undefined,
  currency: string | null | undefined,
): Pick<PaidScaffoldDraftNode, 'budget_mode' | 'campaign_daily_budget_minor_units'> &
  BidKeys => {
  const budgetMode = kept(data.budgetMode, row?.budgetMode);
  if (budgetMode !== 'cbo') {
    return { budget_mode: budgetMode, campaign_daily_budget_minor_units: null, ...NO_BID };
  }
  return {
    budget_mode: 'cbo',
    campaign_daily_budget_minor_units: keptMinor(
      data.campaignBudgetAmount,
      row?.campaignDailyBudgetMinorUnits,
      currency,
    ),
    ...bidOf(data, row, currency),
  };
};

/**
 * An ad set's P5 keys, given its campaign's. Under CBO it carries no strategy of its own and
 * keeps its own cap only when the campaign's strategy is capped (Meta's per-ad-set cap);
 * anything else is a value the inspector hides there.
 */
export const adSetFieldsOf = (
  data: AdSetData,
  row: PaidScaffoldNodeRow | undefined,
  campaign: ReturnType<typeof campaignFieldsOf>,
  currency: string | null | undefined,
): BidKeys &
  Pick<PaidScaffoldDraftNode, 'start_time' | 'end_time' | 'custom_event_type' | 'pixel_id'> => {
  const bid = bidOf(data, row, currency);
  const cbo = campaign.budget_mode === 'cbo';
  return {
    ...(cbo
      ? {
          ...NO_BID,
          bid_amount_minor_units: isCapped(campaign.bid_strategy)
            ? bid.bid_amount_minor_units
            : null,
        }
      : bid),
    start_time: keptText(data.startTime, row?.startTime),
    end_time: keptText(data.endTime, row?.endTime),
    custom_event_type: kept(data.customEventType, row?.customEventType),
    pixel_id: keptText(data.pixelId, row?.pixelId),
  };
};

/**
 * The cross-node field rules (`paidScaffoldFullFieldIssues`), each said with the node's NAME:
 * the contract names `adset c0/a1`, a path key the canvas never shows anyone.
 */
export const namedFieldIssues = (
  nodes: readonly Pick<PaidScaffoldDraftNode, 'level' | 'path_key' | 'name'>[],
  issues: readonly string[],
): string[] => {
  const wheres = nodes
    .map((node) => ({ where: `${node.level} ${node.path_key}`, name: node.name }))
    .sort((left, right) => right.where.length - left.where.length);
  return issues.map((issue) => {
    const match = wheres.find(
      ({ where }) => issue.startsWith(where) && /^[\s:]/.test(issue.slice(where.length)),
    );
    if (!match) return issue;
    return `${match.name}: ${issue.slice(match.where.length).replace(/^:?\s*/, '')}`;
  });
};

const nonEmpty = (values: string[] | undefined): string[] | null =>
  values && values.length > 0 ? values : null;

/**
 * The placement the inspector shows, falling back to the one the row was built with for a node
 * loaded before placements were editable; a drawn ad set starts on Advantage+. The arrays only
 * travel on manual placement — the compiler refuses them anywhere else.
 */
const placementOf = (adSet: AdSetData, row: PaidScaffoldNodeRow | undefined) => {
  const stored = asRecord(row?.payload.placement);
  const manual = adSet.placementMode ? adSet.placementMode === 'manual' : stored.mode === 'manual';
  if (!manual) {
    return {
      placement_mode: 'advantage_plus' as const,
      publisher_platforms: null,
      facebook_positions: null,
      instagram_positions: null,
      device_platforms: null,
    };
  }
  const pick = (edited: string[] | undefined, key: string) =>
    adSet.placementMode ? nonEmpty(edited) : asStrings(stored[key]);
  return {
    placement_mode: 'manual' as const,
    publisher_platforms: pick(adSet.publisherPlatforms, 'publisher_platforms'),
    facebook_positions: pick(adSet.facebookPositions, 'facebook_positions'),
    instagram_positions: pick(adSet.instagramPositions, 'instagram_positions'),
    device_platforms: pick(adSet.devicePlatforms, 'device_platforms'),
  };
};

/**
 * The field rules for ONE node, as the inspector shows them beside the fields they are about —
 * the same `paidScaffoldFullFieldIssues` the save refuses by, run on just this node (and, for an
 * ad set, the campaign whose budget mode decides its rules), so a field the inspector calls fine
 * is one the save keeps. Each issue comes back without the node prefix: the inspector is
 * already the node.
 */
export function inlineFieldIssues(params: {
  nodeId: string;
  nodes: readonly CampaignCanvasNode[];
  edges: readonly CampaignCanvasEdge[];
  hydration: CanvasHydration | null;
  now?: number;
}): string[] {
  const { nodeId, nodes, edges, hydration, now = Date.now() } = params;
  const node = nodes.find((entry) => entry.id === nodeId);
  if (!node) return [];
  const rowOf = (entry: CampaignCanvasNode | undefined) =>
    entry?.data.provenance ? hydration?.sourceRows[entry.data.provenance.sourceId] : undefined;
  const campaignNode =
    node.type === 'campaign'
      ? node
      : (nodes.find(
          (entry) =>
            entry.type === 'campaign' &&
            edges.some((edge) => edge.source === entry.id && edge.target === nodeId),
        ) ?? nodes.find((entry) => entry.type === 'campaign'));
  const campaignData = (campaignNode?.data ?? {}) as CampaignData;
  const currency =
    hydration?.plan?.currency ??
    campaignData.budgetCurrency ??
    (node.data as AdSetData).budgetCurrency ??
    null;
  const campaign = campaignFieldsOf(campaignData, rowOf(campaignNode), currency);
  const base = { ...EMPTY_NODE, ordinal: 0, name: 'node' };
  const campaignInput: PaidScaffoldDraftNode = {
    ...base,
    ...campaign,
    path_key: 'campaign',
    parent_path_key: null,
    level: 'campaign',
  };

  let inputs: PaidScaffoldDraftNode[];
  let where: string;
  if (node.type === 'campaign') {
    inputs = [campaignInput];
    where = 'campaign campaign';
  } else if (node.type === 'ad-set') {
    const data = node.data as AdSetData;
    inputs = [
      campaignInput,
      {
        ...base,
        path_key: 'adset',
        parent_path_key: 'campaign',
        level: 'adset',
        optimization_goal: data.optimizationGoal || null,
        ...adSetFieldsOf(data, rowOf(node), campaign, currency),
      },
    ];
    where = 'adset adset';
  } else if (node.type === 'ad') {
    const data = node.data as AdData;
    inputs = [
      {
        ...base,
        path_key: 'ad',
        parent_path_key: null,
        level: 'ad',
        url_tags: keptText(data.urlTags, rowOf(node)?.urlTags),
      },
    ];
    where = 'ad ad';
  } else {
    return [];
  }
  return paidScaffoldFullFieldIssues(inputs, now)
    .filter((issue) => issue.startsWith(where) && /^[\s:]/.test(issue.slice(where.length)))
    .map((issue) => issue.slice(where.length).replace(/^:?\s*/, ''));
}

export function buildScaffoldSaveRequest(params: {
  nodes: CampaignCanvasNode[];
  edges: CampaignCanvasEdge[];
  hydration: CanvasHydration;
  /** The clock an end date is judged against. */
  now?: number;
}): PaidScaffoldVersionSaveRequest {
  const { nodes, edges, hydration, now = Date.now() } = params;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rowOf = (node: CampaignCanvasNode): PaidScaffoldNodeRow | undefined =>
    node.data.provenance ? hydration.sourceRows[node.data.provenance.sourceId] : undefined;
  const targetsOf = (sourceId: string, type: CampaignCanvasNode['type']) =>
    edges
      .filter((edge) => edge.source === sourceId)
      .map((edge) => byId.get(edge.target))
      .filter((node): node is CampaignCanvasNode => node?.type === type)
      .sort(byCanvasOrder);
  const sourcesOf = (targetId: string, type: CampaignCanvasNode['type']) =>
    edges
      .filter((edge) => edge.target === targetId)
      .map((edge) => byId.get(edge.source))
      .filter((node): node is CampaignCanvasNode => node?.type === type);

  const campaigns = nodes.filter((node) => node.type === 'campaign');
  if (campaigns.length !== 1) {
    throw new CanvasSaveError('A scaffold saves exactly one campaign.', [
      `The canvas has ${campaigns.length} campaigns.`,
    ]);
  }
  const campaign = campaigns[0] as CampaignCanvasNode & { data: CampaignData };
  const campaignRow = rowOf(campaign);

  // Everything the walk below cannot reach would vanish from the saved version — refused by
  // name instead, so "Saved as vN" always means the whole canvas.
  const issues: string[] = collectOrphanNodes(nodes, edges).map(
    (orphan) => `${orphan.label}: ${orphan.reason}.`,
  );
  const objective = campaign.data.objective;
  // A drawn ad set has no product of its own; it belongs to the version's product, which
  // every existing row already names.
  const versionProductKey =
    Object.values(hydration.sourceRows).find((row) => row.productKey)?.productKey ?? null;
  const plannedBudget = new Map(
    (hydration.plan?.adsets ?? []).map((adSet) => [adSet.path_key, adSet]),
  );
  const firstAdSet = nodes.find((node) => node.type === 'ad-set')?.data as AdSetData | undefined;
  // The account's currency, which every amount on the canvas is in.
  const currency =
    hydration.plan?.currency ?? campaign.data.budgetCurrency ?? firstAdSet?.budgetCurrency ?? null;
  const campaignFields = campaignFieldsOf(campaign.data, campaignRow, currency);
  const cbo = campaignFields.budget_mode === 'cbo';

  /** The provenance a node is saved with: its own, plus what a person gave elsewhere. */
  const provenanceFor = (
    node: CampaignCanvasNode,
    entry: PaidScaffoldDraftNode,
    userKeys: string[] = [],
  ) => {
    const row = rowOf(node);
    return draftFieldProvenance({
      level: entry.level,
      draft: entry,
      recorded: node.data.fieldProvenance ?? row?.fieldProvenance ?? null,
      drawn: !row,
      userKeys,
    });
  };
  /** A feeding node (audience, creative) a person drew or edited gives its keys to its target. */
  const gaveThrough = (feeder: CampaignCanvasNode | undefined, mark: string) =>
    Boolean(feeder && (!feeder.data.provenance || feeder.data.fieldProvenance?.[mark] === 'user_gave'));

  const campaignDraft: PaidScaffoldDraftNode = {
    ...EMPTY_NODE,
    ...campaignFields,
    path_key: 'c0',
    parent_path_key: null,
    level: 'campaign',
    ordinal: 0,
    name: campaign.data.label.trim() || hydration.scaffoldName,
    objective: objective ?? asString(campaignRow?.payload.objective),
    // The campaign carries the version's ONE list; [] declares none. Every other level omits it.
    special_ad_categories: campaign.data.specialAdCategories ?? [],
  };
  campaignDraft.field_provenance = provenanceFor(campaign, campaignDraft);
  const draft: PaidScaffoldDraftNode[] = [campaignDraft];

  targetsOf(campaign.id, 'ad-set').forEach((adSetNode, adSetIndex) => {
    const adSet = adSetNode.data as AdSetData;
    const row = rowOf(adSetNode);
    const pathKey = `c0/a${adSetIndex}`;
    const productKey = row?.productKey ?? versionProductKey ?? slug(hydration.scaffoldName);
    const angleKey = row?.angleKey ?? slug(adSet.label);
    const audienceNode = sourcesOf(adSetNode.id, 'audience')[0];
    const audience = audienceNode?.data as AudienceData | undefined;
    const isGroup = audience?.mode === 'group';
    // A copied audience is a live ad set's targeting verbatim; no draft field can hold it, so
    // saving would quietly re-target the ad set. Refused by name, with where to edit it.
    if (audience?.mode === 'copied') {
      issues.push(
        paidScaffoldCopiedAudienceSaveIssue(audience.copiedFromAdSetName ?? audience.label),
      );
    }
    // A group node with no group picked would otherwise fall through to broad targeting built
    // from whatever the hidden broad fields still held.
    if (audience && isGroup && !audience.audienceGroupVersionId) {
      issues.push(
        `${audience.label}: pick a published audience group, or switch the audience to Broad.`,
      );
    }

    // Under CBO the campaign holds the budget: an ad set sends none, whatever it still shows.
    const budgetMinor = cbo ? null : minorOf(adSet.budgetAmount, adSet.budgetCurrency ?? currency);
    // An untouched derived budget is sent as null so the compiler re-derives it and keeps
    // calling it derived; a changed one is the person's, and says so in the evidence.
    const planned = row ? plannedBudget.get(row.pathKey) : undefined;
    const untouched =
      budgetMinor !== null &&
      row?.dailyBudgetMinorUnits === budgetMinor &&
      planned?.budget_source !== 'user';

    const adSetDraft: PaidScaffoldDraftNode = {
      ...EMPTY_NODE,
      ...placementOf(adSet, row),
      ...adSetFieldsOf(adSet, row, campaignFields, currency),
      path_key: pathKey,
      parent_path_key: 'c0',
      level: 'adset',
      ordinal: adSetIndex,
      name: adSet.label.trim() || `Ad set ${adSetIndex + 1}`,
      product_key: productKey,
      angle_key: angleKey,
      objective,
      optimization_goal: adSet.optimizationGoal || null,
      funnel_stage: asString(row?.payload.funnel_stage) ?? 'prospecting',
      audience_group_version_id: isGroup ? (audience?.audienceGroupVersionId ?? null) : null,
      broad_targeting: audience && !isGroup ? broadTargetingOf(audience) : null,
      daily_budget_minor_units: untouched ? null : budgetMinor,
    };
    adSetDraft.field_provenance = provenanceFor(
      adSetNode,
      adSetDraft,
      gaveThrough(audienceNode, AUDIENCE_MARK)
        ? [isGroup ? 'audience_group_version_id' : 'broad_targeting']
        : [],
    );
    draft.push(adSetDraft);

    targetsOf(adSetNode.id, 'ad').forEach((adNode, adIndex) => {
      const ad = adNode.data as AdData;
      const adRow = rowOf(adNode);
      const creativeNode = targetsOf(adNode.id, 'creative')[0];
      const creative = creativeNode?.data as CreativeData | undefined;
      const adDraft: PaidScaffoldDraftNode = {
        ...EMPTY_NODE,
        path_key: `${pathKey}/ad${adIndex}`,
        parent_path_key: pathKey,
        level: 'ad',
        ordinal: adIndex,
        name: ad.label.trim() || `Ad ${adIndex + 1}`,
        product_key: productKey,
        angle_key: angleKey,
        concept_key: adRow?.conceptKey ?? slug(ad.label),
        link: linkOf(ad.linkUrl, `${ad.label}: destination URL`, issues),
        message: text(ad.primaryText, 2_200),
        headline: text(ad.headline, 255),
        description: text(ad.description, 255),
        call_to_action_type: ad.callToAction || null,
        creative: creativeOf(creative, issues),
        url_tags: keptText(ad.urlTags, adRow?.urlTags),
      };
      adDraft.field_provenance = provenanceFor(
        adNode,
        adDraft,
        adDraft.creative && gaveThrough(creativeNode, CREATIVE_MARK) ? ['creative'] : [],
      );
      draft.push(adDraft);
    });
  });

  issues.push(...namedFieldIssues(draft, paidScaffoldFullFieldIssues(draft, now)));

  if (issues.length > 0) {
    throw new CanvasSaveError('This canvas cannot be saved yet.', issues);
  }

  const parsed = paidScaffoldVersionSaveRequestSchema.safeParse({
    base_version_id: hydration.versionId,
    name: hydration.scaffoldName,
    rationale: 'Edited on the Campaign Canvas.',
    nodes: draft,
    optimizer_enrollment: hydration.plan?.optimizer_enrollment ?? {
      portfolio: { new_name: hydration.scaffoldName.slice(0, 200) },
      apply_mode: 'recommend',
      autopilot_scopes: PAID_SCAFFOLD_AUTOPILOT_SCOPES_OFF,
    },
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const [, index, field] = issue.path;
      const node = typeof index === 'number' ? draft[index] : undefined;
      return node ? `${node.name}: ${String(field ?? '')} ${issue.message}`.trim() : issue.message;
    });
    throw new CanvasSaveError('This canvas cannot be saved yet.', issues);
  }
  return parsed.data;
}

/** POST the save; the Backend compiles, hashes and stores it as a new version. */
export async function saveScaffoldVersion(params: {
  scaffoldId: string;
  body: PaidScaffoldVersionSaveRequest;
}): Promise<PaidScaffoldVersionSaveResponse> {
  try {
    return await http.request({
      path: `/api/agents/jaina/scaffolds/${encodeURIComponent(params.scaffoldId)}/versions`,
      method: 'POST',
      body: params.body,
      schema: paidScaffoldVersionSaveResponseSchema,
    });
  } catch (error) {
    // The route refuses by name (`stale_base_version`, `scaffold_rejected` + one line per rule);
    // that list IS the message, not the status text `ApiError` would fall back to.
    if (error instanceof ApiError) {
      const refusal = paidScaffoldVersionSaveErrorSchema.safeParse(error.payload);
      if (refusal.success) {
        throw new CanvasSaveError(refusal.data.error.message, refusal.data.error.issues);
      }
    }
    throw error;
  }
}
