/**
 * The canvas -> OpenAI Ads publish plan.
 *
 * Pure. It reads the graph plus the baseline captured at hydration and answers one
 * question: what would publishing DO? The component renders that answer as a confirmation
 * and only then hands the same plan to the executor — so the list a person approves is the
 * list that runs, rather than a summary written separately from the work.
 *
 * Three rules the plan enforces, all of them consequences of the API's own shape:
 *
 *   1. ORDER. A campaign must exist before its ad groups, and an ad group before its ads.
 *      Steps come out already sorted; the executor never re-decides.
 *   2. CREATE vs UPDATE is decided by `openAiId`, never by "does it look new". A node that
 *      carries one exists upstream.
 *   3. STATUS IS NOT PART OF A PUBLISH. Activating is the one action that can spend money,
 *      so it stays an explicit, separate button rather than a field that rides along in a
 *      diff someone skimmed.
 */

import type {
  OpenAiAdsAdCreateRequest,
  OpenAiAdsAdGroupCreateRequest,
  OpenAiAdsAdGroupUpdateRequest,
  OpenAiAdsAdUpdateRequest,
  OpenAiAdsCampaignCreateRequest,
  OpenAiAdsCampaignUpdateRequest,
} from '@continuum/contracts';
import type {
  CampaignCanvasEdge,
  CampaignCanvasNode,
  OpenAiAdData,
  OpenAiAdGroupData,
  OpenAiCampaignData,
} from '@/CampaignCanvas/types';

export type OpenAiPublishBaseline = Record<string, unknown>;

export type OpenAiPublishStep =
  | { kind: 'create-campaign'; nodeId: string; label: string; body: OpenAiAdsCampaignCreateRequest }
  | {
      kind: 'update-campaign';
      nodeId: string;
      label: string;
      openAiId: string;
      body: OpenAiAdsCampaignUpdateRequest;
      changed: string[];
    }
  | {
      kind: 'create-ad-group';
      nodeId: string;
      parentNodeId: string;
      label: string;
      body: Omit<OpenAiAdsAdGroupCreateRequest, 'campaign_id'>;
    }
  | {
      kind: 'update-ad-group';
      nodeId: string;
      label: string;
      openAiId: string;
      body: OpenAiAdsAdGroupUpdateRequest;
      changed: string[];
    }
  | {
      kind: 'create-ad';
      nodeId: string;
      parentNodeId: string;
      label: string;
      body: Omit<OpenAiAdsAdCreateRequest, 'ad_group_id'>;
    }
  | {
      kind: 'update-ad';
      nodeId: string;
      label: string;
      openAiId: string;
      body: OpenAiAdsAdUpdateRequest;
      changed: string[];
    }
  | {
      kind: 'archive';
      nodeId: string;
      label: string;
      openAiId: string;
      entity: 'campaign' | 'ad_group' | 'ad';
    };

export interface OpenAiPublishPlan {
  steps: OpenAiPublishStep[];
  /** Reasons this graph cannot publish as it stands. A non-empty list blocks the button. */
  issues: string[];
}

const parentOf = (nodeId: string, edges: CampaignCanvasEdge[]): string | undefined =>
  edges.find((edge) => edge.target === nodeId)?.source;

const asCampaign = (node: CampaignCanvasNode) => node.data as unknown as OpenAiCampaignData;
const asAdGroup = (node: CampaignCanvasNode) => node.data as unknown as OpenAiAdGroupData;
const asAd = (node: CampaignCanvasNode) => node.data as unknown as OpenAiAdData;

const sameList = (a: readonly string[] | undefined, b: readonly string[] | undefined): boolean =>
  (a ?? []).length === (b ?? []).length &&
  (a ?? []).every((value, index) => value === (b ?? [])[index]);

const unixOf = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
};

/** Which fields differ from the baseline, named the way the confirmation renders them. */
function changedFields(
  current: Record<string, unknown>,
  baseline: Record<string, unknown> | undefined,
  fields: Array<{ key: string; label: string; list?: boolean }>,
): string[] {
  if (!baseline) return fields.map((field) => field.label);
  return fields
    .filter((field) =>
      field.list
        ? !sameList(
            current[field.key] as string[] | undefined,
            baseline[field.key] as string[] | undefined,
          )
        : current[field.key] !== baseline[field.key],
    )
    .map((field) => field.label);
}

function campaignCreateBody(data: OpenAiCampaignData): OpenAiAdsCampaignCreateRequest {
  return {
    name: data.label,
    status: 'paused',
    budget: { lifetime_spend_limit_micros: data.lifetimeSpendLimitMicros ?? 0 },
    ...(data.description ? { description: data.description } : {}),
    ...(data.biddingType ? { bidding_type: data.biddingType } : {}),
    ...(data.biddingType === 'conversions' && data.conversionEventSettingIds?.length
      ? { conversion_event_setting_ids: data.conversionEventSettingIds.slice(0, 1) }
      : {}),
    ...(unixOf(data.startTime) ? { start_time: unixOf(data.startTime) } : {}),
    ...(unixOf(data.endTime) ? { end_time: unixOf(data.endTime) } : {}),
    ...(data.locationIds?.length
      ? { targeting: { locations: { include: data.locationIds.map((id) => ({ id })) } } }
      : {}),
  } as OpenAiAdsCampaignCreateRequest;
}

function campaignUpdateBody(data: OpenAiCampaignData): OpenAiAdsCampaignUpdateRequest {
  return {
    name: data.label,
    description: data.description ?? null,
    ...(data.lifetimeSpendLimitMicros != null
      ? { budget: { lifetime_spend_limit_micros: data.lifetimeSpendLimitMicros } }
      : {}),
    start_time: unixOf(data.startTime) ?? null,
    end_time: unixOf(data.endTime) ?? null,
    targeting: data.locationIds?.length
      ? { locations: { include: data.locationIds.map((id) => ({ id })) } }
      : null,
  } as OpenAiAdsCampaignUpdateRequest;
}

function adGroupCreateBody(
  data: OpenAiAdGroupData,
): Omit<OpenAiAdsAdGroupCreateRequest, 'campaign_id'> {
  return {
    name: data.label,
    status: 'paused',
    ...(data.description ? { description: data.description } : {}),
    ...(data.contextHints?.length ? { context_hints: data.contextHints } : {}),
    bidding_config: {
      billing_event_type: data.billingEventType,
      max_bid_micros: data.maxBidMicros ?? 0,
    },
  } as Omit<OpenAiAdsAdGroupCreateRequest, 'campaign_id'>;
}

function adGroupUpdateBody(data: OpenAiAdGroupData): OpenAiAdsAdGroupUpdateRequest {
  return {
    name: data.label,
    description: data.description ?? null,
    context_hints: data.contextHints ?? null,
    ...(data.maxBidMicros != null
      ? {
          bidding_config: {
            billing_event_type: data.billingEventType,
            max_bid_micros: data.maxBidMicros,
          },
        }
      : {}),
  } as OpenAiAdsAdGroupUpdateRequest;
}

function adCreativeBody(data: OpenAiAdData) {
  return {
    type: data.creativeType,
    title: data.title,
    body: data.body,
    ...(data.targetUrl ? { target_url: data.targetUrl } : {}),
    ...(data.fileId ? { file_id: data.fileId } : {}),
  };
}

/**
 * Build the plan.
 *
 * `baseline` is the node data captured at hydration, keyed by node id. A draft canvas has
 * no baseline at all, which is exactly right: every node is then a create.
 */
export function planOpenAiPublish(params: {
  nodes: CampaignCanvasNode[];
  edges: CampaignCanvasEdge[];
  baseline?: Record<string, OpenAiPublishBaseline>;
}): OpenAiPublishPlan {
  const { nodes, edges, baseline } = params;
  const issues: string[] = [];
  const steps: OpenAiPublishStep[] = [];

  const campaigns = nodes.filter((node) => node.type === 'openai-campaign');
  const adGroups = nodes.filter((node) => node.type === 'openai-ad-group');
  const ads = nodes.filter((node) => node.type === 'openai-ad');

  if (campaigns.length === 0) {
    issues.push('Add a campaign node — an ad group cannot exist without one.');
  }
  if (campaigns.length > 1) {
    // Not an API limit, a canvas one: the record bar shows a single campaign, and a graph
    // with two would publish into a state the bar could not then re-open.
    issues.push('This canvas publishes one campaign at a time. Remove the extra campaign node.');
  }

  campaigns.forEach((node) => {
    const data = asCampaign(node);
    if (!data.lifetimeSpendLimitMicros) {
      issues.push(`"${data.label}" needs a lifetime budget.`);
    }
    if (data.biddingType === 'conversions' && !data.conversionEventSettingIds?.length) {
      issues.push(`"${data.label}" optimizes for conversions and needs one conversion event.`);
    }

    if (data.openAiId) {
      const changed = changedFields(
        data as unknown as Record<string, unknown>,
        baseline?.[node.id],
        [
          { key: 'label', label: 'name' },
          { key: 'description', label: 'description' },
          { key: 'lifetimeSpendLimitMicros', label: 'budget' },
          { key: 'startTime', label: 'start time' },
          { key: 'endTime', label: 'end time' },
          { key: 'locationIds', label: 'locations', list: true },
        ],
      );
      if (changed.length > 0) {
        steps.push({
          kind: 'update-campaign',
          nodeId: node.id,
          label: data.label,
          openAiId: data.openAiId,
          body: campaignUpdateBody(data),
          changed,
        });
      }
      return;
    }
    steps.push({
      kind: 'create-campaign',
      nodeId: node.id,
      label: data.label,
      body: campaignCreateBody(data),
    });
  });

  adGroups.forEach((node) => {
    const data = asAdGroup(node);
    const parentNodeId = parentOf(node.id, edges);
    if (!parentNodeId) {
      issues.push(`"${data.label}" is not attached to a campaign.`);
      return;
    }
    if (!data.maxBidMicros) {
      issues.push(`"${data.label}" needs a max bid.`);
    }

    if (data.openAiId) {
      const changed = changedFields(
        data as unknown as Record<string, unknown>,
        baseline?.[node.id],
        [
          { key: 'label', label: 'name' },
          { key: 'description', label: 'description' },
          { key: 'maxBidMicros', label: 'max bid' },
          { key: 'billingEventType', label: 'billing event' },
          { key: 'contextHints', label: 'context hints', list: true },
        ],
      );
      if (changed.length > 0) {
        steps.push({
          kind: 'update-ad-group',
          nodeId: node.id,
          label: data.label,
          openAiId: data.openAiId,
          body: adGroupUpdateBody(data),
          changed,
        });
      }
      return;
    }
    steps.push({
      kind: 'create-ad-group',
      nodeId: node.id,
      parentNodeId,
      label: data.label,
      body: adGroupCreateBody(data),
    });
  });

  ads.forEach((node) => {
    const data = asAd(node);
    const parentNodeId = parentOf(node.id, edges);
    if (!parentNodeId) {
      issues.push(`"${data.label}" is not attached to an ad group.`);
      return;
    }
    if (data.creativeType === 'chat_card' && !data.fileId) {
      issues.push(`"${data.label}" needs an image before it can be created.`);
    }
    if (data.creativeType === 'chat_card' && !data.targetUrl) {
      issues.push(`"${data.label}" needs a destination URL.`);
    }

    if (data.openAiId) {
      const changed = changedFields(
        data as unknown as Record<string, unknown>,
        baseline?.[node.id],
        [
          { key: 'label', label: 'name' },
          { key: 'title', label: 'title' },
          { key: 'body', label: 'body' },
          { key: 'targetUrl', label: 'destination' },
          { key: 'fileId', label: 'image' },
        ],
      );
      if (changed.length > 0) {
        steps.push({
          kind: 'update-ad',
          nodeId: node.id,
          label: data.label,
          openAiId: data.openAiId,
          body: { name: data.label, creative: adCreativeBody(data) } as OpenAiAdsAdUpdateRequest,
          changed,
        });
      }
      return;
    }
    steps.push({
      kind: 'create-ad',
      nodeId: node.id,
      parentNodeId,
      label: data.label,
      body: { name: data.label, status: 'paused', creative: adCreativeBody(data) } as Omit<
        OpenAiAdsAdCreateRequest,
        'ad_group_id'
      >,
    });
  });

  // Anything the baseline knew about and the graph no longer has. Archiving is
  // IRREVERSIBLE upstream, so these are reported separately and confirmed on their own.
  if (baseline) {
    const liveIds = new Set(nodes.map((node) => node.id));
    for (const [nodeId, data] of Object.entries(baseline)) {
      if (liveIds.has(nodeId)) continue;
      const record = data as { openAiId?: string; label?: string; __entity?: string };
      if (!record.openAiId) continue;
      steps.push({
        kind: 'archive',
        nodeId,
        label: record.label ?? nodeId,
        openAiId: record.openAiId,
        entity: (record.__entity as 'campaign' | 'ad_group' | 'ad') ?? 'ad',
      });
    }
  }

  return { steps: sortSteps(steps), issues };
}

/**
 * Parents before children, and archives last.
 *
 * The API refuses an ad group whose campaign does not exist yet, and archiving before the
 * creates would remove a parent something still needs.
 */
const STEP_ORDER: Record<OpenAiPublishStep['kind'], number> = {
  'create-campaign': 0,
  'update-campaign': 1,
  'create-ad-group': 2,
  'update-ad-group': 3,
  'create-ad': 4,
  'update-ad': 5,
  archive: 6,
};

function sortSteps(steps: OpenAiPublishStep[]): OpenAiPublishStep[] {
  return [...steps].sort((a, b) => STEP_ORDER[a.kind] - STEP_ORDER[b.kind]);
}

/** A one-line human summary per step, for the confirmation the person actually reads. */
export function describeOpenAiPublishStep(step: OpenAiPublishStep): string {
  switch (step.kind) {
    case 'create-campaign':
      return `Create campaign "${step.label}" (paused)`;
    case 'update-campaign':
      return `Update campaign "${step.label}" — ${step.changed.join(', ')}`;
    case 'create-ad-group':
      return `Create ad group "${step.label}" (paused)`;
    case 'update-ad-group':
      return `Update ad group "${step.label}" — ${step.changed.join(', ')}`;
    case 'create-ad':
      return `Create ad "${step.label}" (paused)`;
    case 'update-ad':
      return `Update ad "${step.label}" — ${step.changed.join(', ')}`;
    case 'archive':
      return `Archive ${step.entity.replace('_', ' ')} "${step.label}" — this cannot be undone`;
  }
}

/** The baseline shape `loadOpenAiGraph` stores, keyed by node id. */
export function captureOpenAiBaseline(
  nodes: CampaignCanvasNode[],
): Record<string, OpenAiPublishBaseline> {
  const entityByType: Record<string, 'campaign' | 'ad_group' | 'ad'> = {
    'openai-campaign': 'campaign',
    'openai-ad-group': 'ad_group',
    'openai-ad': 'ad',
  };
  return Object.fromEntries(
    nodes
      .filter((node) => node.type in entityByType)
      .map((node) => [
        node.id,
        { ...(node.data as Record<string, unknown>), __entity: entityByType[node.type as string] },
      ]),
  );
}
