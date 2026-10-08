'use client';

export { describeRenderDiscoveryFailure } from './api-render/renderDiscoveryCopy';

import type {
  ApiRenderFitVerdict,
  ApiRenderInputSet,
  ApiRenderInputValue,
  ApiRenderPreflightRequest,
  ApiRenderTemplateContract,
  ApiRenderTemplateSummary,
  ApiRenderWorkspaceStatus,
  MediaAsset,
} from '@continuum/contracts';
import { apiRenderTargetHandles, checkAssetSwap, planFitCheck } from '@continuum/contracts';
import {
  type NodeProps,
  NodeResizer,
  type Node as ReactFlowNode,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { Check, ChevronsUpDown, Clapperboard } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { ApiRenderNodeData, StudioNode } from '../types';
import { apiRendersApi } from './api-render/apiRendersApi';
import { CanvasRenderPreview, type CanvasPreviewCase } from './api-render/CanvasRenderPreview';
import { RenderFitMap } from './api-render/RenderFitMap';
import { RenderVariableFields } from './api-render/RenderVariableFields';
import { describeRenderDiscoveryFailure } from './api-render/renderDiscoveryCopy';
import {
  inspectApiRenderMediaInputs,
  resolveApiRenderVariables,
  resolveApiRenderVariations,
} from './api-render/resolveApiRenderVariables';
import { useApiRenderJobs } from './api-render/useApiRenderJobs';
import { NodeBadge, NodeTitleBar } from './NodeChrome';

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
  const [inputSets, setInputSets] = useState<ApiRenderInputSet[]>([]);
  const [busy, setBusy] = useState(false);
  // Separate from `error`: a workspace that the render fleet does not honour is
  // not a failed request, it is a working request with the wrong destination.
  // Showing it as an error would be wrong, and showing nothing is worse.
  const [workspace, setWorkspace] = useState<ApiRenderWorkspaceStatus | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

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
  const { jobs, setJobs, error, setError, refreshJobs } = useApiRenderJobs({
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

  const bindingId = data.bindingId ?? null;

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    setLoadingTemplates(true);
    // No binding: one merged list of everything this brand may render. The node used to pick a
    // workspace first and list within it, which asked the author about our deployment topology
    // and could reach only one workspace at a time.
    void apiRendersApi
      .listTemplates(brandId, null)
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
      )
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false);
      });
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

  const selectTemplate = useCallback(
    async (template: ApiRenderTemplateSummary) => {
      if (!brandId) return;
      const templateKey = template.key;
      setBusy(true);
      setError(null);
      try {
        // The binding comes OFF THE ROW, not from a separate choice: a key is unique only within
        // a sub-app, so the template the author clicked already names the only binding whose
        // contract matches it. Persisted on the node so a reloaded graph renders where it did.
        const contract = await apiRendersApi.getContract(brandId, templateKey, template.bindingId);
        patchData({
          bindingId: template.bindingId,
          templateKey,
          templateName: contract.template.name,
          contractHash: contract.template.contractHash,
          variableDefinitions: contract.variables,
          // Everything Template Forge knows about this template, kept so the layout can be
          // drawn and the fonts listed without a second fetch — and so both survive a reload.
          templateLayout: contract.layout,
          templateFonts: contract.fonts,
          templateRatios: contract.template.ratios,
          contractSource: contract.template.contractSource,
          templateSourceAssetId: contract.template.sourceAssetId,
          variables: {},
          assetDims: {},
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
  const previewCases: CanvasPreviewCase[] = batchIds.length
    ? batchIds.flatMap((setId) => {
        const set = inputSets.find((item) => item.id === setId);
        return set ? [{ key: set.id, label: set.name, values: set.variables }] : [];
      })
    : data.inputSetId
      ? inputSets.flatMap((set) =>
          set.id === data.inputSetId
            ? [{ key: set.id, label: set.name, values: set.variables }]
            : [],
        )
      : variations.records.length
        ? variations.records.map((record, index) => ({
            key: String(index),
            label: record.label,
            values: record.variables,
          }))
        : [
            {
              key: 'current',
              label: 'Current values',
              values: resolveApiRenderVariables({ nodeId: id, data, nodes, edges }).variables,
            },
          ];
  const syncPreviewContract = useCallback(
    (contract: ApiRenderTemplateContract) => {
      if (contract.template.key !== data.templateKey || contract.template.contractHash !== data.contractHash) return;
      const next = {
        variableDefinitions: contract.variables,
        templateLayout: contract.layout,
        templateFonts: contract.fonts,
        templateRatios: contract.template.ratios,
      };
      if (
        JSON.stringify(next) ===
        JSON.stringify({
          variableDefinitions: data.variableDefinitions,
          templateLayout: data.templateLayout,
          templateFonts: data.templateFonts,
          templateRatios: data.templateRatios,
        })
      ) return;
      patchData(next);
    },
    [data, patchData],
  );

  /**
   * The placement check, run here the moment artwork is chosen.
   *
   * The same closed form the server runs at preflight and the forge runs offline — one port,
   * pinned against the forge's own fixtures. This copy exists for latency alone: the answer
   * that is frozen onto the render is the SERVER's, computed over the assets it actually
   * pinned, so a stale preview here costs a preview and never a wrong render.
   *
   * A wired slot has no size in the browser (an edge carries an asset id, not pixels), so it
   * comes back `unknown` and says "Measured at Prepare" — which is the truth, and which is
   * also what escalates the finished frame to the judge if the server cannot size it either.
   */
  const fit = useMemo(() => {
    const definitions = data.variableDefinitions ?? [];
    const boxes = data.templateLayout?.boxes ?? [];
    const verdicts = definitions
      .filter(
        (variable) =>
          (variable.kind === 'image' || variable.kind === 'video') && !variable.reserved,
      )
      .map((variable) =>
        checkAssetSwap({
          key: variable.key,
          placement: variable.placement,
          asset: data.assetDims?.[variable.key] ?? null,
          neighbours: boxes.filter((row) => row.key !== variable.key),
        }),
      );
    return {
      byKey: new Map<string, ApiRenderFitVerdict>(
        verdicts.map((verdict) => [verdict.key, verdict]),
      ),
      report: planFitCheck({
        comp: data.templateLayout?.comp ?? null,
        slots: verdicts,
      }),
      verdicts,
    };
  }, [data.assetDims, data.templateLayout, data.variableDefinitions]);

  /**
   * Remember the chosen artwork's pixel size alongside the pin.
   *
   * The pin is what renders; these numbers are only what lets the check above run without a
   * round trip. Written in the same patch as the pin so the two can never disagree about which
   * asset is in the slot.
   */
  const pickMedia = useCallback(
    (key: string, value: ApiRenderInputValue, assets: MediaAsset[]) => {
      const first = assets[0];
      const dims = first?.width && first.height ? { w: first.width, h: first.height } : undefined;
      patchData({
        variables: { ...data.variables, [key]: value },
        assetDims: dims
          ? { ...(data.assetDims ?? {}), [key]: dims }
          : // No recorded size is not zero. Dropping the entry makes the slot read `unknown`,
            // which is what sends the finished frame to the judge.
            Object.fromEntries(Object.entries(data.assetDims ?? {}).filter(([k]) => k !== key)),
        inputSetId: null,
      });
    },
    [data.assetDims, data.variables, patchData],
  );

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
      // The environment the picker is ON. Omitted when it is the brand's default, because an
      // absent binding means "the default" server-side and a blank one is a 400. Without this
      // the whole selection was cosmetic: the node would list templates and fetch a contract
      // from the chosen workspace, then preflight against the default one — a contract-hash
      // mismatch at best, and a render into the wrong workspace at worst.
      ...(bindingId ? { bindingId } : {}),
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
    bindingId,
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
  const chosenTemplate = templates.find((template) => template.key === data.templateKey) ?? null;
  // A template name is prefixed by the fleet with its own bracketed tag; the tag is noise to
  // everyone but the fleet.
  const templateLabel = (template: ApiRenderTemplateSummary) =>
    template.name.replace(/^\[[^\]]+\]\s*/, '');
  const statusTone =
    workspace?.state === 'eligible'
      ? ('success' as const)
      : workspace?.state === 'unknown'
        ? ('muted' as const)
        : ('warning' as const);

  return (
    <div
      className={cn(
        'relative group h-full w-full min-w-[320px] min-h-[300px]',
        isSelectedByOther && 'selected-by-other',
      )}
      style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
    >
      <NodeResizer minWidth={320} minHeight={300} isVisible={selected} />
      <CanvasNode
        selected={selected}
        handles={{ target: false, source: false }}
        className="h-full w-full overflow-hidden p-0"
      >
        <NodeTitleBar icon={Clapperboard} label="API Render">
          <NodeBadge>{renderCount(variationCount)}</NodeBadge>
        </NodeTitleBar>
        <NodeContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 text-xs">
          {/* Where this renders — reported, never chosen. The eligibility verdict still has to be
              on screen: `env_plane_undeployed` is the state that most needs saying, because the
              fleet does not refuse it, it renders against the shared workspace and looks like
              success. */}
          <div className="flex items-center gap-1.5">
            <span className="truncate text-2xs text-muted-foreground">
              {chosenTemplate?.environment ?? workspace?.workspace ?? 'No workspace'}
            </span>
            {workspace ? (
              <Tooltip>
                <TooltipTrigger
                  render={<Badge variant={statusTone}>{workspace.state.replace(/_/g, ' ')}</Badge>}
                />
                <TooltipContent className="max-w-64">{workspace.detail}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          {/* Searchable, because a workspace holds hundreds of templates and a <select> of
              hundreds is a list nobody can get to the bottom of. */}
          <Popover open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
            <PopoverTrigger
              disabled={busy || !templatesOffered}
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="nodrag w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {chosenTemplate ? templateLabel(chosenTemplate) : 'Choose template…'}
                  </span>
                  <ChevronsUpDown data-icon="inline-end" aria-hidden />
                </Button>
              }
            />
            <PopoverContent className="nodrag w-80 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search templates…" />
                <CommandList>
                  <CommandEmpty>No template matches.</CommandEmpty>
                  <CommandGroup>
                    {templates.map((template) => (
                      <CommandItem
                        // The pair, never the key: two sub-apps can both hold 133, and React
                        // drops the second child of a duplicated key without a word.
                        key={`${template.bindingId}:${template.key}`}
                        value={`${templateLabel(template)} ${template.key}`}
                        onSelect={() => {
                          setTemplatePickerOpen(false);
                          void selectTemplate(template);
                        }}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate">{templateLabel(template)}</span>
                          <span className="flex flex-wrap items-center gap-1">
                            {template.contractSource === 'template_forge' ? (
                              <Badge variant="violet">Forge</Badge>
                            ) : null}
                            {template.ratios.slice(0, 4).map((ratio) => (
                              <Badge key={ratio} variant="muted">
                                {ratio}
                              </Badge>
                            ))}
                            {/* Null means nobody checked, which must not read as "none
                                missing" — so only a real count is shown. */}
                            {template.fontsMissing ? (
                              <Badge variant="warning">{template.fontsMissing} fonts missing</Badge>
                            ) : null}
                          </span>
                        </span>
                        {template.key === data.templateKey ? <Check aria-hidden /> : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {loadingTemplates && templates.length === 0 ? (
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-2/3" />
            </div>
          ) : null}

          {data.templateKey ? (
            <>
              {/* The layout, to scale, with the chosen artwork drawn where it lands. Only when
                  the template carries measurements — a drawing of a template nobody parsed
                  would be a picture of nothing. */}
              {selected && brandId && data.contractHash ? (
                <>
                  {variations.errors.length ? (
                    <p className="text-2xs text-warning">{variations.errors.join(' · ')}</p>
                  ) : null}
                  <CanvasRenderPreview
                    key={`${data.bindingId ?? 'default'}:${data.templateKey}`}
                    brandId={brandId}
                    bindingId={data.bindingId ?? null}
                    templateKey={data.templateKey}
                    contractHash={data.contractHash}
                    nodeId={id}
                    cases={previewCases}
                    onContract={syncPreviewContract}
                  />
                </>
              ) : (
                <RenderFitMap layout={data.templateLayout ?? null} verdicts={fit.verdicts} />
              )}
              <RenderVariableFields
                definitions={data.variableDefinitions ?? []}
                values={data.variables}
                brandId={brandId}
                connectedKeys={connectedKeys}
                mediaStatus={mediaStatus}
                assetDims={data.assetDims}
                fit={fit.byKey}
                onChange={(key, value) =>
                  patchData({ variables: { ...data.variables, [key]: value }, inputSetId: null })
                }
                onPickMedia={pickMedia}
                // DELETE the key rather than blanking it. `resolveApiRenderVariables` treats an
                // empty string as an answered scalar, so a cleared media slot that kept its key
                // would read as filled with nothing instead of as unfilled.
                onClear={(key) => {
                  const { [key]: _cleared, ...rest } = data.variables ?? {};
                  const { [key]: _dims, ...dims } = data.assetDims ?? {};
                  patchData({ variables: rest, assetDims: dims, inputSetId: null });
                }}
              />
            </>
          ) : templatesOffered ? (
            <Empty className="border-0 py-6">
              <EmptyHeader>
                <EmptyTitle className="text-xs">No template chosen</EmptyTitle>
                <EmptyDescription className="text-2xs">
                  Pick one to see what it needs and where the artwork lands.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {error ? (
            <p className="rounded-md bg-destructive/10 px-2 py-1 text-2xs text-destructive">
              {error}
            </p>
          ) : null}
          {workspace && !templatesOffered ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-2xs">
              {workspace.detail}
            </p>
          ) : null}

          <div className="mt-auto flex items-center gap-2 border-t border-border/60 pt-2">
            <span className="text-2xs text-muted-foreground">
              {renderCount(variationCount)} · saves to Library
            </span>
            <Button
              size="sm"
              className="nodrag ml-auto min-w-32"
              disabled={busy || !data.templateKey}
              onClick={() => void submitRender()}
            >
              {busy ? (
                <>
                  <Spinner data-icon="inline-start" /> Submitting…
                </>
              ) : (
                `Render ${variationCount}`
              )}
            </Button>
          </div>
        </NodeContent>
      </CanvasNode>
    </div>
  );
}
