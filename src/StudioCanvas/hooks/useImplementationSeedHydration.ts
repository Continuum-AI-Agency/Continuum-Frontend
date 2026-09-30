import { createNodeData, type PipelineRunReceipt, type StudioNodeType } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useToastContext } from '@/components/ui/ToastProvider';
import { signLibraryAsset } from '@/lib/ai-studio/elements';
import { readPipelineRun } from '@/lib/ai-studio/pipelines';
import { apiRendersApi } from '../nodes/api-render/apiRendersApi';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { mergeSeedIntoGraph } from '../utils/mergeSeedIntoGraph';
import { offsetSeedBelow, type SeedNodeBuild } from '../utils/seedStarterFlow';

export function implementationReviewSeed(receipt: PipelineRunReceipt): SeedNodeBuild {
  const nodes: StudioNode[] = [];
  const edges: Edge[] = [];
  const add = (
    id: string,
    type: StudioNodeType,
    data: Record<string, unknown>,
    x: number,
    y: number,
  ) => nodes.push({ id, type, position: { x, y }, ...createNodeData(type, data) } as StudioNode);
  let y = 0;
  let selectedId: string | undefined;
  for (const review of receipt.pending_reviews ?? []) {
    const prefix = `review:${receipt.run_id}:${review.nodeId}`;
    selectedId = review.kind === 'render' ? `${prefix}:0` : prefix;
    if (review.kind === 'organic') {
      add(
        `${prefix}:draft`,
        'plannerDraft',
        {
          targetDraftId: review.draftId,
          targetUpdatedAt: review.expectedUpdatedAt,
          savedAt: receipt.finished_at,
          mode: 'find',
        },
        0,
        y,
      );
      add(
        prefix,
        'organicPublish',
        { schedule: review.action === 'schedule' ? 'scheduled' : 'now' },
        420,
        y,
      );
      edges.push({
        id: `${prefix}:draft-wire`,
        source: `${prefix}:draft`,
        target: prefix,
        sourceHandle: 'draft',
        targetHandle: 'draft-in',
      });
    } else if (review.kind === 'render') {
      for (const [record, request] of review.requests.entries())
        add(
          `${prefix}:${record}`,
          'apiRender',
          { ...request, variables: request.variables ?? {}, deliveryEnabled: true },
          420,
          y + record * 320,
        );
    } else if (review.kind === 'paid') {
      const request = review.request;
      const assets = [...request.assets].sort((a, b) => a.order - b.order);
      add(
        prefix,
        'paidPublisher',
        {
          format: request.format,
          adAccountId: request.adAccountId,
          campaignId: request.campaignId,
          adsetId: request.adsetId,
          targetAdId: request.adId,
          expectedCreativeId: request.expectedCreativeId,
          assetSlots: assets.map((_, order) => ({ id: `card-${order}`, order })),
        },
        420,
        y,
      );
      for (const [order, asset] of assets.entries()) {
        const id = `${prefix}:asset-${order}`;
        add(
          id,
          asset.kind,
          {
            assetId: asset.assetId,
            assetVersionId: asset.versionId,
            fileName: `Creative ${order + 1}`,
          },
          0,
          y + order * 200,
        );
        edges.push({
          id: `${id}:wire`,
          source: id,
          target: prefix,
          sourceHandle: asset.kind,
          targetHandle: request.format === 'carousel' ? `asset-card-${order}` : `${asset.kind}-in`,
        });
      }
    }
    y +=
      review.kind === 'paid'
        ? Math.max(420, review.request.assets.length * 220)
        : review.kind === 'render'
          ? review.requests.length * 320 + 100
          : 420;
  }
  const selected = nodes.find((node) => node.id === selectedId);
  if (selected) selected.selected = true;
  return { nodes, edges };
}

/** URL handoffs append only after the room has loaded, with deterministic ids. */
export function useImplementationSeedHydration({
  brandId,
  activeRoomId,
  isLoading,
}: {
  brandId?: string;
  activeRoomId?: string;
  isLoading: boolean;
}) {
  const search = useSearchParams();
  const templateKey = search.get('forgeTemplate');
  const bindingId = search.get('forgeBinding');
  const runId = search.get('pipelineRun');
  const hydrated = useRef<string | null>(null);
  const toast = useToastContext();
  useEffect(() => {
    if (isLoading || !brandId || (!templateKey && !runId)) return;
    const key = `${brandId}:${activeRoomId}:${templateKey}:${bindingId}:${runId}`;
    if (hydrated.current === key) return;
    let cancelled = false;
    void (async () => {
      let seed: SeedNodeBuild;
      if (templateKey) {
        const contract = await apiRendersApi.getContract(brandId, templateKey, bindingId);
        seed = {
          nodes: [
            {
              id: `forge:${bindingId ?? 'default'}:${templateKey}`,
              type: 'apiRender',
              position: { x: 0, y: 0 },
              selected: true,
              ...createNodeData('apiRender', {
                bindingId,
                templateKey,
                templateName: contract.template.name,
                contractHash: contract.template.contractHash,
                variableDefinitions: contract.variables,
                templateLayout: contract.layout,
                templateFonts: contract.fonts,
                templateRatios: contract.template.ratios,
                contractSource: contract.template.contractSource,
                templateSourceAssetId: contract.template.sourceAssetId,
                templateOutputs: contract.outputs,
                templateOutputKinds: contract.template.outputKinds,
                variables: {},
              }),
            } as StudioNode,
          ],
          edges: [],
        };
      } else {
        const receipt = await readPipelineRun(brandId, runId!);
        seed = implementationReviewSeed(receipt);
        if (!seed.nodes.length)
          throw new Error('This run has no delivery actions awaiting review.');
        for (const node of seed.nodes) {
          if (node.type === 'apiRender') {
            const contract = await apiRendersApi.getContract(
              brandId,
              String(node.data.templateKey),
              typeof node.data.bindingId === 'string' ? node.data.bindingId : null,
            );
            if (contract.template.contractHash !== node.data.contractHash)
              throw new Error(
                'This template changed since the workflow ran. Review a new run before delivering.',
              );
            node.data = {
              ...node.data,
              templateName: contract.template.name,
              variableDefinitions: contract.variables,
              templateLayout: contract.layout,
              templateFonts: contract.fonts,
              templateRatios: contract.template.ratios,
              templateOutputs: contract.outputs,
              templateOutputKinds: contract.template.outputKinds,
              contractSource: contract.template.contractSource,
              templateSourceAssetId: contract.template.sourceAssetId,
            };
            continue;
          }
          if (node.type !== 'image' && node.type !== 'video') continue;
          const assetId = node.data.assetId;
          const versionId = node.data.assetVersionId;
          if (typeof assetId !== 'string' || typeof versionId !== 'string')
            throw new Error('The review is missing an exact media version.');
          const url = await signLibraryAsset(brandId, assetId, versionId);
          node.data = { ...node.data, [node.type]: url };
        }
      }
      if (cancelled) return;
      const state = useStudioStore.getState();
      if (state.brandId !== brandId || state.activeRoomId !== activeRoomId) return;
      seed = offsetSeedBelow(seed, state.nodes);
      const merged = mergeSeedIntoGraph({ nodes: state.nodes, edges: state.edges }, seed);
      hydrated.current = key;
      if (merged.nodes.length === state.nodes.length && merged.edges.length === state.edges.length)
        return;
      state.takeSnapshot();
      state.setNodes(merged.nodes as StudioNode[]);
      state.setEdges(merged.edges as Edge[]);
      state.triggerSave();
    })().catch((cause) => {
      if (!cancelled)
        toast?.show({
          title: 'Could not open Canvas handoff',
          description: cause instanceof Error ? cause.message : 'Try opening the link again.',
          variant: 'warning',
        });
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, activeRoomId, isLoading, templateKey, bindingId, runId, toast]);
}
