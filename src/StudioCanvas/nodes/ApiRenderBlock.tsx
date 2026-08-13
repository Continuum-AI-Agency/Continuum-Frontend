'use client';

import type {
  ApiRenderJob,
  ApiRenderPreflightResponse,
  ApiRenderTemplateSummary,
  PaidCanvasTarget,
} from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import { Copy, RefreshCw, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { ApiRenderNodeData, StudioNode } from '../types';
import { apiRendersApi } from './api-render/apiRendersApi';
import { resolveApiRenderVariables } from './api-render/resolveApiRenderVariables';
import { publishingApi } from './publish/publishingApi';

const statusLabel = (job: ApiRenderJob) => {
  const receipt = job.delivery[0];
  if (receipt?.status === 'published') return `Published · Meta ad ${receipt.adId ?? 'created'}`;
  if (receipt?.status === 'error' || receipt?.status === 'dropped') {
    return `Delivery ${receipt.status} · ${receipt.reason ?? 'See render log'}`;
  }
  if (job.status === 'finished')
    return receipt ? 'Render finished · delivery pending' : 'Render finished';
  return job.status;
};

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
  const [targets, setTargets] = useState<PaidCanvasTarget[]>([]);
  const [jobs, setJobs] = useState<ApiRenderJob[]>([]);
  const [prepared, setPrepared] = useState<ApiRenderPreflightResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const refreshJobs = useCallback(async () => {
    if (!brandId) return;
    const response = await apiRendersApi.listJobs(brandId, 8);
    setJobs(response.items);
  }, [brandId]);

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void Promise.all([apiRendersApi.listTemplates(brandId), apiRendersApi.listJobs(brandId, 8)])
      .then(([templateResponse, jobResponse]) => {
        if (cancelled) return;
        setTemplates(templateResponse.items);
        setJobs(jobResponse.items);
      })
      .catch(
        (cause) =>
          !cancelled &&
          setError(cause instanceof Error ? cause.message : 'Render discovery failed'),
      );
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const paidLevel = data.delivery?.campaignId ? 'adset' : 'campaign';
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void publishingApi
      .searchPaid({
        brandId,
        adAccountId: data.delivery?.adAccountId,
        level: paidLevel,
        parentId: paidLevel === 'adset' ? data.delivery?.campaignId : undefined,
        limit: 50,
      })
      .then((response) => {
        if (cancelled) return;
        setTargets(response.items);
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
      })
      .catch(
        (cause) =>
          !cancelled && setError(cause instanceof Error ? cause.message : 'Meta discovery failed'),
      );
    return () => {
      cancelled = true;
    };
  }, [brandId, data.delivery, paidLevel, patchData]);

  const selectTemplate = useCallback(
    async (templateKey: string) => {
      if (!brandId) return;
      setBusy(true);
      setError(null);
      setPrepared(null);
      try {
        const contract = await apiRendersApi.getContract(brandId, templateKey);
        patchData({
          templateKey,
          templateName: contract.template.name,
          contractHash: contract.template.contractHash,
          variableDefinitions: contract.variables,
          variables: {},
          status: 'idle',
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Template contract failed');
      } finally {
        setBusy(false);
      }
    },
    [brandId, patchData],
  );

  const prepare = useCallback(async () => {
    if (!brandId || !data.templateKey || !data.contractHash) return;
    if (!data.delivery?.adAccountId || !data.delivery.campaignId || !data.delivery.adsetId) {
      setError('Choose a campaign and ad set before preparing the render.');
      return;
    }
    const resolved = resolveApiRenderVariables({ nodeId: id, data, nodes, edges });
    if (resolved.errors.length > 0) {
      setError(resolved.errors.join(' · '));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await apiRendersApi.preflight({
        brandId,
        templateKey: data.templateKey,
        contractHash: data.contractHash,
        variables: resolved.variables,
        delivery: {
          action: 'create',
          adAccountId: data.delivery.adAccountId,
          campaignId: data.delivery.campaignId,
          adsetId: data.delivery.adsetId,
          adStatus: 'PAUSED',
        },
      });
      setPrepared(response);
      patchData({ status: 'prepared' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preflight failed');
    } finally {
      setBusy(false);
    }
  }, [brandId, data, edges, id, nodes, patchData]);

  const confirm = useCallback(async () => {
    if (!prepared) return;
    setBusy(true);
    setError(null);
    patchData({ status: 'submitting' });
    try {
      const job = await apiRendersApi.createJob({ confirmationToken: prepared.confirmationToken });
      setPrepared(null);
      patchData({ latestJobId: job.id, status: job.status });
      await refreshJobs();
      show({
        title: 'Render queued',
        description:
          'The delivery remains PAUSED in Meta. Track render and publication receipts below.',
        variant: 'success',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Render submission failed';
      setError(message);
      patchData({ status: 'failed', error: message });
    } finally {
      setBusy(false);
    }
  }, [patchData, prepared, refreshJobs, show]);

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
              Render → Meta
            </span>
          </div>
          <p className="rounded bg-muted/60 px-2 py-1 text-2xs text-muted-foreground">
            Manual handoff. Prepare has no effects; Confirm queues a watermarked render and a PAUSED
            ad.
          </p>

          <select
            aria-label="Render template"
            className="nodrag h-8 rounded-md border border-border bg-background px-2"
            value={data.templateKey ?? ''}
            disabled={busy}
            onChange={(event) => void selectTemplate(event.target.value)}
          >
            <option value="">Choose template…</option>
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.name}
              </option>
            ))}
          </select>

          {(data.variableDefinitions ?? []).map((variable) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: wraps its own input a few lines below
            <label
              key={variable.key}
              className="relative flex flex-col gap-1 rounded border border-border/70 p-2"
            >
              <span className="text-2xs text-muted-foreground">
                {variable.label}
                {variable.required ? ' *' : ''}
              </span>
              {['image', 'video'].includes(variable.kind) ? (
                <>
                  <Handle
                    type="target"
                    id={`variable-${variable.key}`}
                    position={Position.Left}
                    className="!h-3 !w-3 !bg-brand-primary"
                    style={{ top: '50%' }}
                  />
                  <span className="text-2xs">
                    Connect a version-pinned {variable.kind} Library node
                  </span>
                </>
              ) : variable.kind === 'boolean' ? (
                <input
                  className="nodrag"
                  type="checkbox"
                  checked={Boolean(data.variables?.[variable.key])}
                  onChange={(event) =>
                    patchData({
                      variables: { ...data.variables, [variable.key]: event.target.checked },
                    })
                  }
                />
              ) : (
                <Input
                  className="nodrag h-7 text-xs"
                  type={variable.kind === 'number' ? 'number' : 'text'}
                  value={String(data.variables?.[variable.key] ?? '')}
                  onChange={(event) =>
                    patchData({
                      variables: {
                        ...data.variables,
                        [variable.key]:
                          variable.kind === 'number'
                            ? Number(event.target.value)
                            : event.target.value,
                      },
                    })
                  }
                />
              )}
            </label>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Meta campaign"
              className="nodrag h-8 rounded-md border border-border bg-background px-2"
              value={data.delivery?.campaignId ?? ''}
              onChange={(event) => {
                const target = targets.find((item) => item.id === event.target.value);
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
              {!data.delivery?.campaignId &&
                targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              {data.delivery?.campaignId ? (
                <option value={data.delivery.campaignId}>{data.delivery.campaignName}</option>
              ) : null}
            </select>
            <select
              aria-label="Meta ad set"
              className="nodrag h-8 rounded-md border border-border bg-background px-2"
              value={data.delivery?.adsetId ?? ''}
              disabled={!data.delivery?.campaignId}
              onChange={(event) => {
                const target = targets.find((item) => item.id === event.target.value);
                patchData({
                  delivery: { ...data.delivery!, adsetId: target?.id, adsetName: target?.name },
                });
              }}
            >
              <option value="">Ad set…</option>
              {data.delivery?.campaignId &&
                targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
            </select>
          </div>

          {error ? (
            <p className="rounded bg-destructive/10 px-2 py-1 text-2xs text-destructive">{error}</p>
          ) : null}
          {prepared ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-2xs">
              <p>{prepared.template.name}</p>
              <p>
                {prepared.target.campaignName} → {prepared.target.adsetName}
              </p>
              <p className="font-mono">
                {prepared.confirmationHash.slice(0, 12)}… · expires{' '}
                {new Date(prepared.expiresAt).toLocaleTimeString()}
              </p>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="nodrag flex-1"
              variant="outline"
              disabled={busy || !data.templateKey}
              onClick={() => void prepare()}
            >
              Prepare
            </Button>
            <Button
              size="sm"
              className="nodrag flex-1"
              disabled={busy || !prepared}
              onClick={() => void confirm()}
            >
              Confirm render
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
              <p className="text-2xs text-muted-foreground">No renders for this brand yet.</p>
            ) : null}
            {jobs.map((job) => (
              <div key={job.id} className="rounded border border-border/60 p-2 text-2xs">
                <button
                  type="button"
                  className="nodrag block w-full text-left hover:text-brand-primary"
                  onClick={async () => {
                    if (!brandId) return;
                    const fresh = await apiRendersApi.getJob(brandId, job.id);
                    setJobs((current) =>
                      current.map((item) => (item.id === fresh.id ? fresh : item)),
                    );
                  }}
                >
                  <span className="block truncate font-medium">{job.templateName}</span>
                  <span className="block truncate text-muted-foreground">{statusLabel(job)}</span>
                </button>
                {job.outputs[0] ? (
                  <a
                    className="nodrag mt-1 inline-block text-brand-primary underline-offset-2 hover:underline"
                    href={job.outputs[0].url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View {job.outputs[0].fileName}
                  </a>
                ) : null}
              </div>
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
