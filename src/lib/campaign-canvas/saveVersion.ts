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
  type PaidScaffoldBroadTargeting,
  type PaidScaffoldCreative,
  type PaidScaffoldDraftNode,
  type PaidScaffoldVersionSaveRequest,
  type PaidScaffoldVersionSaveResponse,
  paidScaffoldVersionSaveErrorSchema,
  paidScaffoldVersionSaveRequestSchema,
  paidScaffoldVersionSaveResponseSchema,
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

export function buildScaffoldSaveRequest(params: {
  nodes: CampaignCanvasNode[];
  edges: CampaignCanvasEdge[];
  hydration: CanvasHydration;
}): PaidScaffoldVersionSaveRequest {
  const { nodes, edges, hydration } = params;
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

  const draft: PaidScaffoldDraftNode[] = [
    {
      ...EMPTY_NODE,
      path_key: 'c0',
      parent_path_key: null,
      level: 'campaign',
      ordinal: 0,
      name: campaign.data.label.trim() || hydration.scaffoldName,
      objective: objective ?? asString(campaignRow?.payload.objective),
      // The campaign carries the version's ONE list; [] declares none. Every other level omits it.
      special_ad_categories: campaign.data.specialAdCategories ?? [],
    },
  ];

  targetsOf(campaign.id, 'ad-set').forEach((adSetNode, adSetIndex) => {
    const adSet = adSetNode.data as AdSetData;
    const row = rowOf(adSetNode);
    const pathKey = `c0/a${adSetIndex}`;
    const productKey = row?.productKey ?? versionProductKey ?? slug(hydration.scaffoldName);
    const angleKey = row?.angleKey ?? slug(adSet.label);
    const audience = sourcesOf(adSetNode.id, 'audience')[0]?.data as AudienceData | undefined;
    const isGroup = audience?.mode === 'group';
    // A group node with no group picked would otherwise fall through to broad targeting built
    // from whatever the hidden broad fields still held.
    if (audience && isGroup && !audience.audienceGroupVersionId) {
      issues.push(
        `${audience.label}: pick a published audience group, or switch the audience to Broad.`,
      );
    }

    const budgetMinor =
      typeof adSet.budgetAmount === 'number' && adSet.budgetAmount > 0
        ? // ponytail: assumes a 2-decimal currency; zero-decimal accounts (JPY, CLP) need the ISO exponent.
          Math.round(adSet.budgetAmount * 100)
        : null;
    // An untouched derived budget is sent as null so the compiler re-derives it and keeps
    // calling it derived; a changed one is the person's, and says so in the evidence.
    const planned = row ? plannedBudget.get(row.pathKey) : undefined;
    const untouched =
      budgetMinor !== null &&
      row?.dailyBudgetMinorUnits === budgetMinor &&
      planned?.budget_source !== 'user';

    draft.push({
      ...EMPTY_NODE,
      ...placementOf(adSet, row),
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
    });

    targetsOf(adSetNode.id, 'ad').forEach((adNode, adIndex) => {
      const ad = adNode.data as AdData;
      const adRow = rowOf(adNode);
      const creative = targetsOf(adNode.id, 'creative')[0]?.data as CreativeData | undefined;
      draft.push({
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
      });
    });
  });

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
