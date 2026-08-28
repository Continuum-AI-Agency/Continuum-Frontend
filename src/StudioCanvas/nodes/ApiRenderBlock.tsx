'use client';

// The discovery failures a brand owner can actually hit, in words they can act
// on. Echoing the raw server code told them nothing and gave them no next step.
const RENDER_DISCOVERY_MESSAGES: Record<string, string> = {
  render_workspace_not_bound:
    'This brand is not connected to a render workspace yet. Ask your Continuum contact to set one up.',
  render_binding_lookup_failed: 'Could not read this brand’s render workspace. Try again shortly.',
  render_api_not_configured: 'Rendering is not configured for this environment yet.',
  render_input_set_name_taken: 'A set with that name already exists for this template.',
  render_contract_changed:
    'This template changed since that set was saved. Re-pick the template and save the set again.',
  render_reserved_variable: 'That variable is filled by Continuum and cannot be sent.',
};

export function describeRenderDiscoveryFailure(message: string): string {
  for (const [code, copy] of Object.entries(RENDER_DISCOVERY_MESSAGES)) {
    if (message.includes(code)) return copy;
  }
  return message || 'Render discovery failed';
}

import type {
  ApiRenderInputSet,
  ApiRenderOutput,
  ApiRenderPreflightRequest,
  ApiRenderTemplateSummary,
  ApiRenderWorkspaceStatus,
  PaidCanvasTarget,
} from '@continuum/contracts';
import { apiRenderTargetHandles } from '@continuum/contracts';
import {
  type NodeProps,
  NodeResizer,
  type Node as ReactFlowNode,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { Clapperboard, RefreshCw, Settings2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { useToast } from '@/components/ui/ToastProvider';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { ApiRenderNodeData, StudioNode } from '../types';
import { resolveCollisions } from '../utils/nodeCollisions';
import { apiRendersApi } from './api-render/apiRendersApi';
import { RenderJobCard } from './api-render/RenderJobCard';
import { RenderVariableFields } from './api-render/RenderVariableFields';
import {
  inspectApiRenderMediaInputs,
  resolveApiRenderVariables,
  resolveApiRenderVariations,
} from './api-render/resolveApiRenderVariables';
import { useApiRenderJobs } from './api-render/useApiRenderJobs';
import { NodeBadge, NodeTitleBar } from './NodeChrome';
import { publishingApi } from './publish/publishingApi';

/**
 * Whether the render fleet will honour THIS brand's workspace.
 *
 * The backend already filters templates twice — the fleet is asked in the brand's bound
 * environment, and the result is intersected fail-closed with the brand's membership
 * allowlist. But whether the fleet honours the environment at all is PROBED: when the env
 * plane is undeployed the fleet does not reject the request, it answers from the shared
 * workspace instead, which looks like success. `renderEligible` is that verdict.
 *
 * So the node gates rather than filters: it never adds to or subtracts from the server's
 * list, it refuses to OFFER a list the server says is not this brand's.
 */
const canOfferTemplates = (workspace: ApiRenderWorkspaceStatus | null) =>
  workspace?.renderEligible === true;

/** Selecting one of several saved sets still takes the batch route, so the count is 1 as often as it is 5. */
const renderCount = (count: number) => `${count} render${count === 1 ? '' : 's'}`;

export function ApiRenderBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<ApiRenderNodeData>>) {
  const brandId = useStudioStore((state) => state.brandId);
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const edges = useStudioStore((state) => state.edges);
  const updateNode = useStudioStore((state) => state.updateNode);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const { show } = useToast();
  const [templates, setTemplates] = useState<ApiRenderTemplateSummary[]>([]);
  // Campaigns and ad sets are SEPARATE lists. One shared array meant choosing a
  // campaign refetched it at ad-set level, so the campaign list vanished and the
  // picker could never be re-opened without clearing the selection.
  const [campaignOptions, setCampaignOptions] = useState<PaidCanvasTarget[]>([]);
  const [adsetOptions, setAdsetOptions] = useState<PaidCanvasTarget[]>([]);
  const [campaignQuery, setCampaignQuery] = useState('');
  const [inputSets, setInputSets] = useState<ApiRenderInputSet[]>([]);
  const [setName, setSetName] = useState('');
  const [busy, setBusy] = useState(false);
  // Separate from `error`: a workspace that the render fleet does not honour is
  // not a failed request, it is a working request with the wrong destination.
  // Showing it as an error would be wrong, and showing nothing is worse.
  const [workspace, setWorkspace] = useState<ApiRenderWorkspaceStatus | null>(null);

  // This node's handles ARE its template contract, and the contract is fetched after the
  // node mounts. React Flow caches a node's handle map at mount, so a handle that appears
  // later is drawn but not connectable and its edges anchor to the wrong point until
  // something else forces a measure. Keyed on the handle set, not on every render.
  const updateNodeInternals = useUpdateNodeInternals();
  const targetHandles = useMemo(
    () => apiRenderTargetHandles({ id, type: 'apiRender', data }),
    [id, data],
  );
  const handleSignature = targetHandles.join('|');
  useEffect(() => {
    updateNodeInternals(id);
  }, [handleSignature, id, updateNodeInternals]);

  // Which variables already have something wired into them, so the inline field can say
  // it is being overridden rather than silently losing to the edge.
  const connectedKeys = useMemo(() => {
    const wired = new Set<string>();
    for (const edge of edges) {
      if (edge.target !== id || !edge.targetHandle?.startsWith('variable-')) continue;
      wired.add(edge.targetHandle.slice('variable-'.length));
    }
    return wired;
  }, [edges, id]);

  const deliveryEnabled = data.deliveryEnabled === true;
  const trackedIds = data.jobIds ?? (data.latestJobId ? [data.latestJobId] : []);
  const { jobs, setJobs, error, setError, refreshJobs, refreshOne } = useApiRenderJobs({
    brandId,
    trackedIds,
  });

  const patchData = useCallback(
    (patch: Partial<ApiRenderNodeData>) => {
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as ApiRenderNodeData), ...patch },
      }));
      useStudioStore.getState().triggerSave();
    },
    [id, updateNode],
  );

  // A brand switch invalidates everything on this node: the template list, the contract,
  // and every saved input. A brand switch must never submit values or pins from another
  // workspace.
  const lastBrandId = useRef<string | null>(brandId);
  useEffect(() => {
    if (lastBrandId.current === brandId) return;
    lastBrandId.current = brandId;
    setTemplates([]);
    setJobs([]);
    setInputSets([]);
    setWorkspace(null);
    setError(null);
    patchData({
      templateKey: null,
      templateName: null,
      contractHash: null,
      variableDefinitions: [],
      variables: {},
      inputSetId: null,
      batchInputSetIds: [],
      status: 'idle',
    });
  }, [brandId, patchData, setError, setJobs]);

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void apiRendersApi
      .listTemplates(brandId)
      .then((response) => {
        if (cancelled) return;
        setTemplates(response.items);
        setWorkspace(response.workspace ?? null);
      })
      .catch(
        (cause) =>
          !cancelled &&
          setError(
            cause instanceof Error
              ? describeRenderDiscoveryFailure(cause.message)
              : 'Render discovery failed',
          ),
      );
    return () => {
      cancelled = true;
    };
  }, [brandId, setError]);

  // Jobs have exactly ONE loader. Two effects both calling the list raced, and the loser
  // overwrote the tracked-id recovery that makes a batch survive a reload — nothing
  // server-side remembers a batch, so that recovery is the whole handle.
  // `refreshJobs` re-identifies whenever the tracked list changes; a ref keeps this a
  // brand-scoped load instead of a refetch on every confirm.
  const loadJobs = useRef(refreshJobs);
  useEffect(() => {
    loadJobs.current = refreshJobs;
  });
  useEffect(() => {
    if (!brandId) return;
    void loadJobs.current().catch(() => {
      // Template discovery above already surfaces an unreachable backend.
    });
  }, [brandId]);

  const latestJob = data.latestJobId ? jobs.find((job) => job.id === data.latestJobId) : undefined;
  useEffect(() => {
    if (!latestJob || latestJob.status !== 'finished' || latestJob.outputs.length === 0) return;
    // The URL is dropped on purpose: both the fleet link and the library-signed one the
    // backend now prefers expire, so persisting either renders a broken preview later.
    const durable = latestJob.outputs.map((output) => ({
      id: output.id,
      kind: output.kind,
      fileName: output.fileName,
      assetId: output.assetId,
      versionId: output.versionId,
    }));
    if (JSON.stringify(data.latestOutputs ?? []) === JSON.stringify(durable)) return;
    patchData({ latestOutputs: durable, status: 'finished' });
  }, [latestJob, data.latestOutputs, patchData]);

  /**
   * Put a finished image output on the canvas as an ordinary reference node.
   *
   * The node is a plain `image` node, which is what makes this small: `ImageNode` already
   * owns the source handle and `resolveApiRenderVariables` already reads `assetId` /
   * `assetVersionId` off one, so the output is immediately wireable as the version-pinned
   * input to the next render. This node adds no handle of its own — a second owner of the
   * same wire is how a handle alias silently stops painting an edge.
   *
   * The React Flow id IS the version, so clicking twice is idempotent and two outputs of
   * the same job (different versions) add independently. `image`/`sourceUrl` come from the
   * live DTO and expire; the durable pair is what survives, and the canvas re-sign path on
   * room load mints a fresh URL from exactly that version.
   */
  const addOutputReference = useCallback(
    (output: ApiRenderOutput) => {
      if (output.kind !== 'image' || !output.assetId || !output.versionId) return;
      const store = useStudioStore.getState();
      const nodeId = `api-render-ref-${output.versionId}`;
      if (store.nodes.some((node) => node.id === nodeId)) {
        show({ title: 'Already on the canvas', description: output.fileName, variant: 'info' });
        return;
      }
      const sourceNode = store.getNodeById(id);
      if (!sourceNode) return;
      store.takeSnapshot();
      const derivedNode: StudioNode = {
        id: nodeId,
        type: 'image',
        position: {
          x: sourceNode.position.x + (sourceNode.measured?.width ?? sourceNode.width ?? 260) + 40,
          y: sourceNode.position.y,
        },
        style: { width: 260, height: 260 },
        data: {
          label: output.fileName,
          image: output.url,
          fileName: output.fileName,
          assetId: output.assetId,
          assetVersionId: output.versionId,
          sourceUrl: output.url,
          referenceStatus: 'ready',
        },
      };
      store.setNodes(resolveCollisions([...store.nodes, derivedNode]) as StudioNode[]);
      store.triggerSave();
      show({ title: 'Added as reference', description: output.fileName, variant: 'success' });
    },
    [id, show],
  );

  // Saved sets are brand AND template scoped — a set authored against one template's
  // contract means nothing against another.
  useEffect(() => {
    if (!brandId || !data.templateKey) {
      setInputSets([]);
      return;
    }
    let cancelled = false;
    void apiRendersApi
      .listInputSets(brandId, data.templateKey)
      .then((response) => !cancelled && setInputSets(response.items))
      .catch(() => {
        // A missing set list must not block rendering; the picker just stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, data.templateKey]);

  // Meta discovery runs ONLY when delivery is switched on. It used to run on every mount,
  // so every library-only render paid for a Graph campaign search it never used.
  useEffect(() => {
    if (!brandId || !deliveryEnabled) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await publishingApi.searchPaid({
          brandId,
          adAccountId: data.delivery?.adAccountId,
          level: 'campaign',
          query: campaignQuery || undefined,
          limit: 50,
        });
        if (cancelled) return;
        setCampaignOptions(response.items);
        if (response.adAccountId !== data.delivery?.adAccountId) {
          patchData({
            delivery: {
              action: 'create',
              adStatus: 'PAUSED',
              ...data.delivery,
              adAccountId: response.adAccountId,
            },
          });
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Meta discovery failed');
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [brandId, campaignQuery, data.delivery, deliveryEnabled, patchData, setError]);

  const chosenCampaignId = data.delivery?.campaignId;
  useEffect(() => {
    if (!brandId || !deliveryEnabled || !chosenCampaignId) {
      setAdsetOptions([]);
      return;
    }
    let cancelled = false;
    void publishingApi
      .searchPaid({
        brandId,
        adAccountId: data.delivery?.adAccountId,
        level: 'adset',
        parentId: chosenCampaignId,
        limit: 50,
      })
      .then((response) => {
        if (!cancelled) setAdsetOptions(response.items);
      })
      .catch(
        (cause) =>
          !cancelled && setError(cause instanceof Error ? cause.message : 'Meta discovery failed'),
      );
    return () => {
      cancelled = true;
    };
  }, [brandId, chosenCampaignId, data.delivery?.adAccountId, deliveryEnabled, setError]);

  const selectTemplate = useCallback(
    async (templateKey: string) => {
      if (!brandId) return;
      setBusy(true);
      setError(null);
      try {
        const contract = await apiRendersApi.getContract(brandId, templateKey);
        patchData({
          templateKey,
          templateName: contract.template.name,
          contractHash: contract.template.contractHash,
          variableDefinitions: contract.variables,
          variables: {},
          inputSetId: null,
          batchInputSetIds: [],
          status: 'idle',
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Template contract failed');
      } finally {
        setBusy(false);
      }
    },
    [brandId, patchData, setError],
  );

  // Delivery is the caller's choice, and the contract says variables come from exactly one
  // place — inline values OR a saved set, never both.
  const deliveryBlock = useCallback(() => {
    if (!deliveryEnabled) return undefined;
    const target = data.delivery;
    if (!target?.adAccountId || !target.campaignId || !target.adsetId) return null;
    return {
      action: 'create' as const,
      adAccountId: target.adAccountId,
      campaignId: target.campaignId,
      adsetId: target.adsetId,
      adStatus: 'PAUSED' as const,
    };
  }, [data.delivery, deliveryEnabled]);

  const saveInputSet = useCallback(async () => {
    if (!brandId || !data.templateKey || !data.contractHash || !setName.trim()) return;
    const resolved = resolveApiRenderVariables({ nodeId: id, data, nodes, edges });
    if (resolved.errors.length > 0) {
      setError(resolved.errors.join(' · '));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The RESOLVED variables are what gets stored — pins included, the reserved key
      // excluded — so replaying a set reproduces the render rather than a half of it.
      const created = await apiRendersApi.createInputSet({
        brandId,
        templateKey: data.templateKey,
        contractHash: data.contractHash,
        name: setName.trim(),
        variables: resolved.variables,
      });
      setInputSets((current) => [created, ...current]);
      setSetName('');
      patchData({ inputSetId: created.id });
    } catch (cause) {
      setError(
        cause instanceof Error ? describeRenderDiscoveryFailure(cause.message) : 'Save failed',
      );
    } finally {
      setBusy(false);
    }
  }, [brandId, data, edges, id, nodes, patchData, setError, setName]);

  const deleteInputSet = useCallback(async () => {
    if (!brandId || !data.inputSetId) return;
    const doomed = data.inputSetId;
    setBusy(true);
    try {
      await apiRendersApi.deleteInputSet(brandId, doomed);
      setInputSets((current) => current.filter((item) => item.id !== doomed));
      patchData({
        inputSetId: null,
        batchInputSetIds: (data.batchInputSetIds ?? []).filter((item) => item !== doomed),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }, [brandId, data.batchInputSetIds, data.inputSetId, patchData, setError]);

  const batchIds = data.batchInputSetIds ?? [];
  const variations = useMemo(
    () => resolveApiRenderVariations({ nodeId: id, data, nodes, edges }),
    [data, edges, id, nodes],
  );
  const mediaStatus = useMemo(
    () => inspectApiRenderMediaInputs({ nodeId: id, data, nodes, edges }),
    [data, edges, id, nodes],
  );
  const variationCount = batchIds.length || (data.inputSetId ? 1 : variations.count);

  const submitRender = useCallback(async () => {
    if (!brandId || !data.templateKey || !data.contractHash) return;
    const delivery = deliveryBlock();
    if (delivery === null) {
      setError('Choose a campaign and ad set, or switch Meta delivery off.');
      return;
    }
    if (!data.inputSetId && batchIds.length === 0 && variations.errors.length > 0) {
      setError(variations.errors.join(' · '));
      return;
    }

    const base = {
      brandId,
      templateKey: data.templateKey,
      contractHash: data.contractHash,
      ...(delivery ? { delivery } : {}),
    };
    setBusy(true);
    setError(null);
    patchData({ status: 'submitting' });
    try {
      if (batchIds.length > 0 || (!data.inputSetId && variations.records.length > 1)) {
        const records =
          batchIds.length > 0
            ? batchIds.map((inputSetId) => ({
                label: inputSets.find((item) => item.id === inputSetId)?.name ?? inputSetId,
                inputSetId,
              }))
            : variations.records;
        const preflight = await apiRendersApi.batchPreflight({ ...base, records });
        const batch = await apiRendersApi.createBatch({
          confirmationToken: preflight.confirmationToken,
        });
        patchData({
          jobIds: [...new Set([...(data.jobIds ?? []), ...batch.jobs.map((job) => job.id)])],
          latestJobId: batch.jobs[0]?.id ?? data.latestJobId,
          status: 'submitting',
        });
        show({
          title: `${renderCount(batch.jobs.length)} queued`,
          description: 'Each result will be saved to this brand’s Library.',
          variant: 'success',
        });
      } else {
        const request: ApiRenderPreflightRequest = data.inputSetId
          ? { ...base, inputSetId: data.inputSetId }
          : { ...base, variables: variations.records[0]?.variables ?? {} };
        const preflight = await apiRendersApi.preflight(request);
        const job = await apiRendersApi.createJob({
          confirmationToken: preflight.confirmationToken,
        });
        patchData({
          latestJobId: job.id,
          jobIds: [...new Set([...(data.jobIds ?? []), job.id])],
          status: job.status,
        });
        show({
          title: 'Render queued',
          description: deliveryEnabled
            ? 'The Meta ad remains paused.'
            : 'The result will be saved to this brand’s Library.',
          variant: 'success',
        });
      }
      await refreshJobs();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? describeRenderDiscoveryFailure(cause.message)
          : 'Render submission failed';
      setError(message);
      patchData({ status: 'failed', error: message });
    } finally {
      setBusy(false);
    }
  }, [
    batchIds,
    brandId,
    data,
    deliveryBlock,
    deliveryEnabled,
    inputSets,
    patchData,
    refreshJobs,
    setError,
    show,
    variations,
  ]);

  const templatesOffered = canOfferTemplates(workspace);

  return (
    <div
      className={cn(
        'relative group h-full w-full min-w-[320px] min-h-[260px]',
        isSelectedByOther && 'selected-by-other',
      )}
      style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
    >
      <NodeResizer minWidth={320} minHeight={260} isVisible={selected} />
      <CanvasNode
        selected={selected}
        handles={{ target: false, source: false }}
        className="h-full w-full overflow-hidden p-0"
      >
        <NodeTitleBar icon={Clapperboard} label="API Render">
          <NodeBadge>{renderCount(variationCount)}</NodeBadge>
        </NodeTitleBar>
        <NodeContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 text-xs">
          <select
            aria-label="Render template"
            className="nodrag h-8 rounded-md border border-border bg-background px-2 disabled:opacity-60"
            value={data.templateKey ?? ''}
            disabled={busy || !templatesOffered}
            onChange={(event) => void selectTemplate(event.target.value)}
          >
            <option value="">Choose template…</option>
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.name.replace(/^\[[^\]]+\]\s*/, '')}
              </option>
            ))}
          </select>

          <RenderVariableFields
            definitions={data.variableDefinitions ?? []}
            values={data.variables}
            connectedKeys={connectedKeys}
            mediaStatus={mediaStatus}
            onChange={(key, value) =>
              patchData({ variables: { ...data.variables, [key]: value }, inputSetId: null })
            }
          />
          {error ? (
            <p className="rounded bg-destructive/10 px-2 py-1 text-2xs text-destructive">{error}</p>
          ) : null}
          {workspace && !templatesOffered ? (
            <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-2xs">
              {workspace.detail}
            </p>
          ) : null}
          <div className="mt-auto flex items-center gap-2 border-t border-border/60 pt-2">
            <span className="text-2xs text-muted-foreground">
              {renderCount(variationCount)} · saves to Library
            </span>
            <Button
              size="sm"
              className="nodrag ml-auto min-w-32 bg-teal-600 text-white hover:bg-teal-700"
              disabled={busy || !data.templateKey}
              onClick={() => void submitRender()}
            >
              {busy ? 'Submitting…' : `Render ${variationCount}`}
            </Button>
          </div>
        </NodeContent>
      </CanvasNode>
      <details className="nodrag absolute left-full top-0 z-20 ml-2">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm hover:bg-muted">
          <Settings2 className="size-3.5" aria-hidden /> Advanced
        </summary>
        <div className="mt-2 flex max-h-[70vh] w-80 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-background p-3 shadow-xl">
          {data.templateKey ? (
            <section className="flex flex-col gap-1.5">
              <span className="font-medium">Presets</span>
              <select
                aria-label="Preset"
                className="h-8 rounded-md border border-border bg-background px-2"
                value={data.inputSetId ?? ''}
                onChange={(event) => patchData({ inputSetId: event.target.value || null })}
              >
                <option value="">Current values</option>
                {inputSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <Input
                  className="h-7 text-xs"
                  aria-label="New preset name"
                  placeholder="Preset name"
                  value={setName}
                  onChange={(event) => setSetName(event.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !setName.trim()}
                  onClick={() => void saveInputSet()}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !data.inputSetId}
                  onClick={() => void deleteInputSet()}
                >
                  Delete
                </Button>
              </div>
              {inputSets.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="text-2xs text-muted-foreground">Render preset variations</span>
                  {inputSets.map((set) => (
                    <label key={set.id} className="flex items-center gap-1.5 text-2xs">
                      <input
                        type="checkbox"
                        checked={batchIds.includes(set.id)}
                        onChange={(event) =>
                          patchData({
                            batchInputSetIds: event.target.checked
                              ? [...batchIds, set.id]
                              : batchIds.filter((item) => item !== set.id),
                          })
                        }
                      />
                      {set.name}
                    </label>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-medium">Paused Meta ad</span>
                <span className="block text-2xs text-muted-foreground">Off by default</span>
              </span>
              <input
                aria-label="Also create a PAUSED Meta ad"
                type="checkbox"
                checked={deliveryEnabled}
                onChange={(event) => patchData({ deliveryEnabled: event.target.checked })}
              />
            </label>
            {deliveryEnabled ? (
              <>
                <Input
                  className="h-7 text-xs"
                  aria-label="Search campaigns"
                  placeholder="Search campaigns"
                  value={campaignQuery}
                  onChange={(event) => setCampaignQuery(event.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Meta campaign"
                    className="h-8 rounded-md border border-border bg-background px-2"
                    value={data.delivery?.campaignId ?? ''}
                    onChange={(event) => {
                      const target = campaignOptions.find((item) => item.id === event.target.value);
                      patchData({
                        delivery: {
                          action: 'create',
                          adStatus: 'PAUSED',
                          adAccountId: data.delivery?.adAccountId,
                          campaignId: target?.id,
                          campaignName: target?.name,
                        },
                      });
                    }}
                  >
                    <option value="">Campaign</option>
                    {data.delivery?.campaignId &&
                    !campaignOptions.some((item) => item.id === data.delivery?.campaignId) ? (
                      <option value={data.delivery.campaignId}>{data.delivery.campaignName}</option>
                    ) : null}
                    {campaignOptions.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Meta ad set"
                    className="h-8 rounded-md border border-border bg-background px-2"
                    value={data.delivery?.adsetId ?? ''}
                    disabled={!data.delivery?.campaignId}
                    onChange={(event) => {
                      const target = adsetOptions.find((item) => item.id === event.target.value);
                      patchData({
                        delivery: {
                          ...data.delivery!,
                          adsetId: target?.id,
                          adsetName: target?.name,
                        },
                      });
                    }}
                  >
                    <option value="">Ad set</option>
                    {adsetOptions.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
          </section>

          <section className="flex flex-col gap-1 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Render history</span>
              <button
                type="button"
                className="rounded p-1 hover:bg-muted"
                onClick={() => void refreshJobs()}
                aria-label="Refresh renders"
              >
                <RefreshCw className="size-3" />
              </button>
            </div>
            {jobs.length === 0 ? (
              <p className="text-2xs text-muted-foreground">
                {data.latestOutputs?.[0]
                  ? `Last render · ${data.latestOutputs[0].fileName}`
                  : 'No renders yet.'}
              </p>
            ) : null}
            {jobs.map((job) => (
              <RenderJobCard
                key={job.id}
                job={job}
                onRefresh={() => void refreshOne(job.id)}
                onUseAsReference={addOutputReference}
              />
            ))}
          </section>
        </div>
      </details>
    </div>
  );
}
