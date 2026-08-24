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
  ApiRenderBatchPreflightResponse,
  ApiRenderInputSet,
  ApiRenderPreflightRequest,
  ApiRenderPreflightResponse,
  ApiRenderTemplateSummary,
  ApiRenderWorkspaceStatus,
  PaidCanvasTarget,
} from '@continuum/contracts';
import { type NodeProps, NodeResizer, type Node as ReactFlowNode } from '@xyflow/react';
import { Copy, RefreshCw, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { useToast } from '@/components/ui/ToastProvider';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { ApiRenderNodeData, StudioNode } from '../types';
import { apiRendersApi } from './api-render/apiRendersApi';
import { RenderJobCard } from './api-render/RenderJobCard';
import { RenderVariableFields } from './api-render/RenderVariableFields';
import { resolveApiRenderVariables } from './api-render/resolveApiRenderVariables';
import { useApiRenderJobs } from './api-render/useApiRenderJobs';
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

export function ApiRenderBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<ApiRenderNodeData>>) {
  const brandId = useStudioStore((state) => state.brandId);
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const edges = useStudioStore((state) => state.edges);
  const updateNode = useStudioStore((state) => state.updateNode);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const { show } = useToast();
  const [templates, setTemplates] = useState<ApiRenderTemplateSummary[]>([]);
  // Campaigns and ad sets are SEPARATE lists. One shared array meant choosing a
  // campaign refetched it at ad-set level, so the campaign list vanished and the
  // picker could never be re-opened without clearing the selection.
  const [campaignOptions, setCampaignOptions] = useState<PaidCanvasTarget[]>([]);
  const [adsetOptions, setAdsetOptions] = useState<PaidCanvasTarget[]>([]);
  const [campaignQuery, setCampaignQuery] = useState('');
  const [prepared, setPrepared] = useState<ApiRenderPreflightResponse | null>(null);
  const [batchPrepared, setBatchPrepared] = useState<ApiRenderBatchPreflightResponse | null>(null);
  const [inputSets, setInputSets] = useState<ApiRenderInputSet[]>([]);
  const [setName, setSetName] = useState('');
  const [busy, setBusy] = useState(false);
  // Separate from `error`: a workspace that the render fleet does not honour is
  // not a failed request, it is a working request with the wrong destination.
  // Showing it as an error would be wrong, and showing nothing is worse.
  const [workspace, setWorkspace] = useState<ApiRenderWorkspaceStatus | null>(null);

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
  // and above all `prepared` — a confirmation token signed for the PREVIOUS brand, still
  // one click from being submitted. Refetching alone left all of it on screen.
  const lastBrandId = useRef<string | null>(brandId);
  useEffect(() => {
    if (lastBrandId.current === brandId) return;
    lastBrandId.current = brandId;
    setTemplates([]);
    setJobs([]);
    setInputSets([]);
    setPrepared(null);
    setBatchPrepared(null);
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
      setPrepared(null);
      setBatchPrepared(null);
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

  const prepare = useCallback(async () => {
    if (!brandId || !data.templateKey || !data.contractHash) return;
    const delivery = deliveryBlock();
    if (delivery === null) {
      setError('Choose a campaign and ad set, or switch Meta delivery off.');
      return;
    }
    // Variables come from exactly one place — inline values OR a saved set. The contract
    // refuses both and refuses neither, so the request is built in one branch or the other
    // rather than merged.
    const base = {
      brandId,
      templateKey: data.templateKey,
      contractHash: data.contractHash,
      ...(delivery ? { delivery } : {}),
    };
    let request: ApiRenderPreflightRequest;
    if (data.inputSetId) {
      request = { ...base, inputSetId: data.inputSetId };
    } else {
      const resolved = resolveApiRenderVariables({ nodeId: id, data, nodes, edges });
      if (resolved.errors.length > 0) {
        setError(resolved.errors.join(' · '));
        return;
      }
      request = { ...base, variables: resolved.variables };
    }
    setBusy(true);
    setError(null);
    try {
      const response = await apiRendersApi.preflight(request);
      setPrepared(response);
      patchData({ status: 'prepared' });
    } catch (cause) {
      setError(
        cause instanceof Error ? describeRenderDiscoveryFailure(cause.message) : 'Preflight failed',
      );
    } finally {
      setBusy(false);
    }
  }, [brandId, data, deliveryBlock, edges, id, nodes, patchData, setError]);

  const confirm = useCallback(async () => {
    if (!prepared) return;
    setBusy(true);
    setError(null);
    patchData({ status: 'submitting' });
    try {
      const job = await apiRendersApi.createJob({ confirmationToken: prepared.confirmationToken });
      setPrepared(null);
      patchData({
        latestJobId: job.id,
        jobIds: [...new Set([...(data.jobIds ?? []), job.id])],
        status: job.status,
      });
      await refreshJobs();
      show({
        title: 'Render queued',
        description: deliveryEnabled
          ? 'The delivery remains PAUSED in Meta. Track render and publication receipts below.'
          : 'Rendering to this brand’s library. No Meta ad is created.',
        variant: 'success',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Render submission failed';
      setError(message);
      patchData({ status: 'failed', error: message });
    } finally {
      setBusy(false);
    }
  }, [data.jobIds, deliveryEnabled, patchData, prepared, refreshJobs, setError, show]);

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
  const prepareBatch = useCallback(async () => {
    if (!brandId || !data.templateKey || !data.contractHash || batchIds.length === 0) return;
    const delivery = deliveryBlock();
    if (delivery === null) {
      setError('Choose a campaign and ad set, or switch Meta delivery off.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await apiRendersApi.batchPreflight({
        brandId,
        templateKey: data.templateKey,
        contractHash: data.contractHash,
        ...(delivery ? { delivery } : {}),
        records: batchIds.map((inputSetId) => ({
          label: inputSets.find((item) => item.id === inputSetId)?.name ?? inputSetId,
          inputSetId,
        })),
      });
      setBatchPrepared(response);
      setPrepared(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? describeRenderDiscoveryFailure(cause.message)
          : 'Batch preflight failed',
      );
    } finally {
      setBusy(false);
    }
  }, [batchIds, brandId, data.contractHash, data.templateKey, deliveryBlock, inputSets, setError]);

  const confirmBatch = useCallback(async () => {
    if (!batchPrepared) return;
    setBusy(true);
    setError(null);
    try {
      const batch = await apiRendersApi.createBatch({
        confirmationToken: batchPrepared.confirmationToken,
      });
      setBatchPrepared(null);
      // This response is the ONLY handle these jobs will ever have: no batch id is
      // persisted server-side and `GET /jobs` cannot filter by one. Losing it loses them.
      patchData({
        jobIds: [...new Set([...(data.jobIds ?? []), ...batch.jobs.map((job) => job.id)])],
        latestJobId: batch.jobs[0]?.id ?? data.latestJobId,
        status: 'submitting',
      });
      await refreshJobs();
      show({
        title: `${batch.jobs.length} renders queued`,
        description: 'Tracked on this node. Each advances on its own.',
        variant: 'success',
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Batch submission failed');
    } finally {
      setBusy(false);
    }
  }, [batchPrepared, data.jobIds, data.latestJobId, patchData, refreshJobs, setError, show]);

  const templatesOffered = canOfferTemplates(workspace);

  return (
    <div
      className={cn(
        'relative group h-full w-full min-w-[360px] min-h-[500px]',
        isSelectedByOther && 'selected-by-other',
      )}
      style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
    >
      <NodeResizer minWidth={360} minHeight={500} isVisible={selected} />
      <CanvasNode
        selected={selected}
        handles={{ target: false, source: false }}
        className="h-full w-full overflow-hidden p-0"
      >
        <NodeContent className="flex h-full flex-col gap-2 overflow-y-auto p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">API Render</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              {deliveryEnabled ? 'Render → Meta' : 'Render → Library'}
            </span>
          </div>
          <p className="rounded bg-muted/60 px-2 py-1 text-2xs text-muted-foreground">
            Manual handoff. Prepare has no effects; Confirm queues a watermarked render
            {deliveryEnabled ? ' and a PAUSED ad.' : ' into this brand’s library.'}
          </p>

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
                {template.name}
              </option>
            ))}
          </select>

          <RenderVariableFields
            definitions={data.variableDefinitions ?? []}
            values={data.variables}
            watermarkLogo={prepared?.watermarkLogo ?? null}
            prepared={prepared !== null}
            onChange={(key, value) =>
              patchData({ variables: { ...data.variables, [key]: value }, inputSetId: null })
            }
          />

          {data.templateKey ? (
            <div className="flex flex-col gap-1 rounded border border-border/70 p-2">
              <span className="text-2xs text-muted-foreground">Saved input sets</span>
              <select
                aria-label="Saved input set"
                className="nodrag h-8 rounded-md border border-border bg-background px-2"
                value={data.inputSetId ?? ''}
                onChange={(event) => patchData({ inputSetId: event.target.value || null })}
              >
                <option value="">Use the values above…</option>
                {inputSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <Input
                  className="nodrag h-7 text-xs"
                  aria-label="New input set name"
                  placeholder="Name this set…"
                  value={setName}
                  onChange={(event) => setSetName(event.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="nodrag"
                  disabled={busy || !setName.trim()}
                  onClick={() => void saveInputSet()}
                >
                  Save as…
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="nodrag"
                  disabled={busy || !data.inputSetId}
                  onClick={() => void deleteInputSet()}
                >
                  Delete
                </Button>
              </div>
              {inputSets.length > 0 ? (
                <>
                  <span className="mt-1 text-2xs text-muted-foreground">
                    Batch — render several sets at once
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {inputSets.map((set) => (
                      // biome-ignore lint/a11y/noLabelWithoutControl: wraps its own checkbox
                      <label key={set.id} className="flex items-center gap-1 text-2xs">
                        <input
                          className="nodrag"
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
                </>
              ) : null}
            </div>
          ) : null}

          {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps the Switch below */}
          <label className="flex items-center justify-between rounded border border-border/70 p-2">
            <span className="text-2xs">
              Also create a PAUSED Meta ad
              <span className="block text-muted-foreground">
                Off: the render lands in this brand’s library and nowhere else.
              </span>
            </span>
            {/*
              A native checkbox, matching the boolean-variable control a few rows up.
              shadcn's `Switch` is Base UI, whose root does not flip under happy-dom, so a
              Switch here would be a control the node's own bench cannot drive — an
              untestable toggle on the one setting that decides whether this render
              touches Meta. Same semantics, same keyboard behaviour, one fewer thing to
              mock.
            */}
            <input
              aria-label="Also create a PAUSED Meta ad"
              className="nodrag"
              type="checkbox"
              checked={deliveryEnabled}
              onChange={(event) => patchData({ deliveryEnabled: event.target.checked })}
            />
          </label>

          {deliveryEnabled ? (
            <>
              <Input
                className="nodrag h-7 text-xs"
                aria-label="Search campaigns"
                placeholder="Search campaigns…"
                value={campaignQuery}
                onChange={(event) => setCampaignQuery(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="Meta campaign"
                  className="nodrag h-8 rounded-md border border-border bg-background px-2"
                  value={data.delivery?.campaignId ?? ''}
                  onChange={(event) => {
                    const target = campaignOptions.find((item) => item.id === event.target.value);
                    // Changing campaign always clears the ad set — an ad set from the
                    // previous campaign is never a valid target for the new one.
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
                  <option value="">Campaign…</option>
                  {data.delivery?.campaignId &&
                  !campaignOptions.some((item) => item.id === data.delivery?.campaignId) ? (
                    // The chosen campaign stays selectable even when the current search
                    // filters it out — otherwise the select shows an empty value.
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
                  className="nodrag h-8 rounded-md border border-border bg-background px-2"
                  value={data.delivery?.adsetId ?? ''}
                  disabled={!data.delivery?.campaignId}
                  onChange={(event) => {
                    const target = adsetOptions.find((item) => item.id === event.target.value);
                    patchData({
                      delivery: { ...data.delivery!, adsetId: target?.id, adsetName: target?.name },
                    });
                  }}
                >
                  <option value="">Ad set…</option>
                  {adsetOptions.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          {error ? (
            <p className="rounded bg-destructive/10 px-2 py-1 text-2xs text-destructive">{error}</p>
          ) : null}
          {workspace && !templatesOffered ? (
            <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-2xs">
              {workspace.detail}
            </p>
          ) : null}
          {prepared ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-2xs">
              <p>{prepared.template.name}</p>
              <p>
                {prepared.target
                  ? `${prepared.target.campaignName} → ${prepared.target.adsetName}`
                  : 'Library only — no Meta delivery'}
              </p>
              {prepared.test ? <p className="font-medium">Test render — watermarked</p> : null}
              <p className="font-mono">
                {prepared.confirmationHash.slice(0, 12)}… · expires{' '}
                {new Date(prepared.expiresAt).toLocaleTimeString()}
              </p>
            </div>
          ) : null}
          {batchPrepared ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-2xs">
              <p className="font-medium">{batchPrepared.records.length} renders prepared</p>
              {batchPrepared.records.map((record) => (
                <p key={record.label} className="truncate text-muted-foreground">
                  {record.label} · {record.inputKeys.length} inputs
                </p>
              ))}
              <p className="font-mono">
                {batchPrepared.confirmationHash.slice(0, 12)}… · expires{' '}
                {new Date(batchPrepared.expiresAt).toLocaleTimeString()}
              </p>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="nodrag flex-1"
              variant="outline"
              disabled={busy || !data.templateKey}
              onClick={() => void (batchIds.length > 0 ? prepareBatch() : prepare())}
            >
              {batchIds.length > 0 ? `Prepare ${batchIds.length} renders` : 'Prepare'}
            </Button>
            <Button
              size="sm"
              className="nodrag flex-1"
              disabled={busy || (!prepared && !batchPrepared)}
              onClick={() => void (batchPrepared ? confirmBatch() : confirm())}
            >
              {batchPrepared ? 'Confirm batch' : 'Confirm render'}
            </Button>
          </div>

          <div className="mt-1 flex items-center justify-between">
            <span className="font-medium">Recent renders</span>
            <button
              type="button"
              className="nodrag rounded p-1 hover:bg-muted"
              onClick={() => void refreshJobs()}
              aria-label="Refresh renders"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-1">
            {jobs.length === 0 ? (
              // On remount the job list is empty until the fetch lands. The saved
              // descriptor names what this node produced; it deliberately carries no URL,
              // so this is text and not a link that would already have expired.
              data.latestOutputs?.[0] ? (
                <p className="text-2xs text-muted-foreground">
                  Last render · {data.latestOutputs[0].fileName}
                </p>
              ) : (
                <p className="text-2xs text-muted-foreground">No renders for this brand yet.</p>
              )
            ) : null}
            {jobs.map((job) => (
              <RenderJobCard key={job.id} job={job} onRefresh={() => void refreshOne(job.id)} />
            ))}
          </div>
        </NodeContent>
      </CanvasNode>
      <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
        <button
          type="button"
          className="nodrag rounded bg-background/80 p-1"
          onClick={() => duplicateNode(id)}
          aria-label="Duplicate"
        >
          <Copy />
        </button>
        <button
          type="button"
          className="nodrag rounded bg-background/80 p-1 text-destructive"
          onClick={() => deleteNode(id)}
          aria-label="Delete"
        >
          <Trash2 />
        </button>
      </div>
    </div>
  );
}
