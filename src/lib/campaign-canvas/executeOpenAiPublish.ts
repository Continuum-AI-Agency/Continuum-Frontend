/**
 * Runs an `OpenAiPublishPlan` against the API.
 *
 * Split from the planner so the plan a person approves is literally the plan that runs,
 * and so this can be driven by a fake `api` in tests. The one piece of state it owns is the
 * node-id -> OpenAI-id map: a campaign created in step 1 has no id until step 1 returns,
 * and its ad groups in step 3 need it. That threading is the whole reason this is a loop
 * rather than a `Promise.all`.
 *
 * It stops at the FIRST failure and reports what already landed. A partial publish is a
 * real state — some objects exist upstream — and pretending otherwise would have the canvas
 * re-create them on the next attempt.
 */

import type { OpenAiPublishPlan, OpenAiPublishStep } from './publishOpenAi';

export interface OpenAiPublishApi {
  createCampaign: (body: unknown) => Promise<{ id: string }>;
  updateCampaign: (id: string, body: unknown) => Promise<{ id: string }>;
  createAdGroup: (body: unknown) => Promise<{ id: string }>;
  updateAdGroup: (id: string, body: unknown) => Promise<{ id: string }>;
  createAd: (body: unknown) => Promise<{ id: string }>;
  updateAd: (id: string, body: unknown) => Promise<{ id: string }>;
  archive: (entity: 'campaign' | 'ad_group' | 'ad', id: string) => Promise<unknown>;
}

export interface OpenAiPublishOutcome {
  applied: Array<{ step: OpenAiPublishStep; openAiId: string | null }>;
  /** node id -> the OpenAI id it now has. The canvas writes these back onto its nodes. */
  idsByNodeId: Record<string, string>;
  failure?: { step: OpenAiPublishStep; message: string };
}

export async function executeOpenAiPublish(
  plan: OpenAiPublishPlan,
  api: OpenAiPublishApi,
  options: { seed?: Record<string, string> } = {},
): Promise<OpenAiPublishOutcome> {
  // Pre-seeded with the ids of nodes that already exist upstream (see `seedExistingIds`).
  // Without it, adding one ad group under an UNCHANGED campaign would fail with "its
  // campaign has not been created yet" — the campaign simply had nothing to publish.
  const idsByNodeId: Record<string, string> = { ...(options.seed ?? {}) };
  const applied: OpenAiPublishOutcome['applied'] = [];

  const resolveParent = (parentNodeId: string): string | null => idsByNodeId[parentNodeId] ?? null;

  for (const step of plan.steps) {
    try {
      switch (step.kind) {
        case 'create-campaign': {
          const created = await api.createCampaign(step.body);
          idsByNodeId[step.nodeId] = created.id;
          applied.push({ step, openAiId: created.id });
          break;
        }
        case 'update-campaign': {
          await api.updateCampaign(step.openAiId, step.body);
          idsByNodeId[step.nodeId] = step.openAiId;
          applied.push({ step, openAiId: step.openAiId });
          break;
        }
        case 'create-ad-group': {
          // A parent that is itself new was created earlier in this same run; a parent that
          // already existed was seeded into the map below before the loop started.
          const campaignId = resolveParent(step.parentNodeId);
          if (!campaignId) {
            throw new Error('its campaign has not been created yet');
          }
          const created = await api.createAdGroup({ ...step.body, campaign_id: campaignId });
          idsByNodeId[step.nodeId] = created.id;
          applied.push({ step, openAiId: created.id });
          break;
        }
        case 'update-ad-group': {
          await api.updateAdGroup(step.openAiId, step.body);
          idsByNodeId[step.nodeId] = step.openAiId;
          applied.push({ step, openAiId: step.openAiId });
          break;
        }
        case 'create-ad': {
          const adGroupId = resolveParent(step.parentNodeId);
          if (!adGroupId) {
            throw new Error('its ad group has not been created yet');
          }
          const created = await api.createAd({ ...step.body, ad_group_id: adGroupId });
          idsByNodeId[step.nodeId] = created.id;
          applied.push({ step, openAiId: created.id });
          break;
        }
        case 'update-ad': {
          await api.updateAd(step.openAiId, step.body);
          idsByNodeId[step.nodeId] = step.openAiId;
          applied.push({ step, openAiId: step.openAiId });
          break;
        }
        case 'archive': {
          await api.archive(step.entity, step.openAiId);
          applied.push({ step, openAiId: step.openAiId });
          break;
        }
      }
    } catch (error) {
      return {
        applied,
        idsByNodeId,
        failure: {
          step,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  return { applied, idsByNodeId };
}

/**
 * Seed the id map with what already exists, so a step whose parent was NOT part of this
 * publish still resolves. Without this, adding one ad group to an existing campaign would
 * fail with "its campaign has not been created yet" — the campaign was simply unchanged.
 */
export function seedExistingIds(
  nodes: Array<{ id: string; data: unknown }>,
): Record<string, string> {
  const seeded: Record<string, string> = {};
  for (const node of nodes) {
    const openAiId = (node.data as { openAiId?: string } | null)?.openAiId;
    if (openAiId) seeded[node.id] = openAiId;
  }
  return seeded;
}
