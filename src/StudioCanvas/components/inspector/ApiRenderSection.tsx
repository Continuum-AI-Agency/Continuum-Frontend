'use client';

// Everything about an API render that will not fit in a 320px node.
//
// The node answers "what does this template need and where does the artwork land". This
// answers the questions you ask once and then leave alone: which saved input set, whether a
// paused Meta ad comes out the other end, which faces the design needs that the brand does not
// hold, and what every past render of this node actually produced.
//
// It replaces a `<details>` panel that floated beside the node and covered the canvas. The
// inspector is where every other node type puts this, and putting it here means one scroll
// container, one focus order, and a node that can be read at a glance again.

import type {
  ApiRenderInputSet,
  ApiRenderJob,
  ApiRenderOutput,
  PaidCanvasTarget,
} from '@continuum/contracts';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { apiRendersApi } from '../../nodes/api-render/apiRendersApi';
import { RenderFitTable } from '../../nodes/api-render/RenderFitTable';
import { RenderJobCard } from '../../nodes/api-render/RenderJobCard';
import { resolveApiRenderVariables } from '../../nodes/api-render/resolveApiRenderVariables';
import { TemplateFontsRow } from '../../nodes/api-render/TemplateFontsRow';
import { useApiRenderJobs } from '../../nodes/api-render/useApiRenderJobs';
import { publishingApi } from '../../nodes/publish/publishingApi';
import { useStudioStore } from '../../stores/useStudioStore';
import type { ApiRenderNodeData, StudioNode } from '../../types';
import { resolveCollisions } from '../../utils/nodeCollisions';
import { InspectorNote, InspectorSection } from './controls';

export function ApiRenderSection({
  nodeId,
  data,
  onPatch,
}: {
  nodeId: string;
  data: ApiRenderNodeData;
  onPatch: (patch: Partial<ApiRenderNodeData>) => void;
}) {
  const brandId = useStudioStore((state) => state.brandId);
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const edges = useStudioStore((state) => state.edges);
  const [inputSets, setInputSets] = useState<ApiRenderInputSet[]>([]);
  const [setName, setSetName] = useState('');
  const [campaignOptions, setCampaignOptions] = useState<PaidCanvasTarget[]>([]);
  const [adsetOptions, setAdsetOptions] = useState<PaidCanvasTarget[]>([]);
  const [campaignQuery, setCampaignQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setLocalError] = useState<string | null>(null);

  const trackedIds = data.jobIds ?? (data.latestJobId ? [data.latestJobId] : []);
  const { jobs, refreshJobs, refreshOne } = useApiRenderJobs({ brandId, trackedIds });
  const batchIds = data.batchInputSetIds ?? [];
  const deliveryEnabled = data.deliveryEnabled === true;

  // Saved sets are brand AND template scoped — a set authored against one template's contract
  // means nothing against another.
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

  // Meta discovery runs ONLY when delivery is switched on. It used to run on every mount, so
  // every library-only render paid for a Graph campaign search it never used.
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
          onPatch({
            delivery: {
              action: 'create',
              adStatus: 'PAUSED',
              ...data.delivery,
              adAccountId: response.adAccountId,
            },
          });
        }
      } catch (cause) {
        if (!cancelled)
          setLocalError(cause instanceof Error ? cause.message : 'Meta discovery failed');
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [brandId, campaignQuery, data.delivery, deliveryEnabled, onPatch]);

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
      .then((response) => !cancelled && setAdsetOptions(response.items))
      .catch(
        (cause) =>
          !cancelled &&
          setLocalError(cause instanceof Error ? cause.message : 'Meta discovery failed'),
      );
    return () => {
      cancelled = true;
    };
  }, [brandId, chosenCampaignId, data.delivery?.adAccountId, deliveryEnabled]);

  const saveInputSet = useCallback(async () => {
    if (!brandId || !data.templateKey || !data.contractHash || !setName.trim()) return;
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const resolved = resolveApiRenderVariables({ nodeId, data, nodes, edges });
    if (resolved.errors.length > 0) {
      setLocalError(resolved.errors.join(' · '));
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      // The RESOLVED variables are what gets stored — pins included, the reserved key excluded
      // — so replaying a set reproduces the render rather than a half of it.
      const created = await apiRendersApi.createInputSet({
        brandId,
        templateKey: data.templateKey,
        contractHash: data.contractHash,
        name: setName.trim(),
        variables: resolved.variables,
      });
      setInputSets((current) => [created, ...current]);
      setSetName('');
      onPatch({ inputSetId: created.id });
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }, [brandId, data, edges, nodeId, nodes, onPatch, setName]);

  const deleteInputSet = useCallback(async () => {
    if (!brandId || !data.inputSetId) return;
    const doomed = data.inputSetId;
    setBusy(true);
    try {
      await apiRendersApi.deleteInputSet(brandId, doomed);
      setInputSets((current) => current.filter((item) => item.id !== doomed));
      onPatch({
        inputSetId: null,
        batchInputSetIds: batchIds.filter((item) => item !== doomed),
      });
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }, [batchIds, brandId, data.inputSetId, onPatch]);

  /**
   * Put a finished image output on the canvas as an ordinary reference node.
   *
   * The node is a plain `image` node, which is what makes this small: `ImageNode` already owns
   * the source handle and `resolveApiRenderVariables` already reads `assetId` /
   * `assetVersionId` off one, so the output is immediately wireable as the version-pinned input
   * to the next render.
   *
   * The React Flow id IS the version, so clicking twice is idempotent and two outputs of the
   * same job add independently. The URL is deliberately not persisted — both the fleet link and
   * the library-signed one expire, and the canvas re-signs from the version on room load.
   */
  const addOutputReference = useCallback(
    (output: ApiRenderOutput) => {
      if (output.kind !== 'image' || !output.assetId || !output.versionId) return;
      const store = useStudioStore.getState();
      const newNodeId = `api-render-ref-${output.versionId}`;
      if (store.nodes.some((node) => node.id === newNodeId)) return;
      const sourceNode = store.getNodeById(nodeId);
      if (!sourceNode) return;
      store.takeSnapshot();
      const derivedNode: StudioNode = {
        id: newNodeId,
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
    },
    [nodeId],
  );

  if (!data.templateKey) {
    return <InspectorNote>Choose a template on the node to configure a render.</InspectorNote>;
  }

  return (
    <>
      {/* What the design needs versus what the brand holds. A template missing a face still
          renders — it finishes and hands back a frame in a fallback typeface, which looks
          exactly like success — so this is the only place that failure is visible before it
          ships. */}
      <TemplateFontsRow
        fonts={data.templateFonts ?? []}
        brandId={brandId ?? null}
        assetId={data.templateSourceAssetId ?? null}
      />

      {/* Every media slot, what the chosen artwork would do to it, and what it would cover. The
          node draws one picture; this is the table behind it. */}
      <RenderFitTable data={data} />

      <InspectorSection title="Presets">
        <Field>
          <FieldLabel htmlFor={`${nodeId}-preset`}>Saved values</FieldLabel>
          <Select
            value={data.inputSetId ?? 'current'}
            onValueChange={(next) => onPatch({ inputSetId: next === 'current' ? null : next })}
          >
            <SelectTrigger id={`${nodeId}-preset`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="current">Current values</SelectItem>
                {inputSets.map((set) => (
                  <SelectItem key={set.id} value={set.id}>
                    {set.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex gap-1">
          <Input
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
            <FieldDescription>
              Render several presets at once — one render each, one confirmation.
            </FieldDescription>
            {inputSets.map((set) => (
              <Field key={set.id} orientation="horizontal">
                <Checkbox
                  id={`${nodeId}-batch-${set.id}`}
                  checked={batchIds.includes(set.id)}
                  onCheckedChange={(checked) =>
                    onPatch({
                      batchInputSetIds: checked
                        ? [...batchIds, set.id]
                        : batchIds.filter((item) => item !== set.id),
                    })
                  }
                />
                <FieldLabel htmlFor={`${nodeId}-batch-${set.id}`} className="font-normal">
                  {set.name}
                </FieldLabel>
              </Field>
            ))}
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Meta delivery">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`${nodeId}-delivery`}>Also create a paused ad</FieldLabel>
            <FieldDescription>
              Off by default. The render always lands in the Library either way.
            </FieldDescription>
          </FieldContent>
          <Switch
            id={`${nodeId}-delivery`}
            checked={deliveryEnabled}
            onCheckedChange={(checked) => onPatch({ deliveryEnabled: checked })}
          />
        </Field>
        {deliveryEnabled ? (
          <>
            <Input
              aria-label="Search campaigns"
              placeholder="Search campaigns"
              value={campaignQuery}
              onChange={(event) => setCampaignQuery(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={data.delivery?.campaignId ?? ''}
                onValueChange={(next) => {
                  const target = campaignOptions.find((item) => item.id === next);
                  onPatch({
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
                <SelectTrigger aria-label="Meta campaign">
                  <SelectValue placeholder="Campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {/* A campaign already chosen but absent from the current search still has
                        to render, or changing the query would silently unset it. */}
                    {data.delivery?.campaignId &&
                    !campaignOptions.some((item) => item.id === data.delivery?.campaignId) ? (
                      <SelectItem value={data.delivery.campaignId}>
                        {data.delivery.campaignName}
                      </SelectItem>
                    ) : null}
                    {campaignOptions.map((target) => (
                      <SelectItem key={target.id} value={target.id}>
                        {target.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={data.delivery?.adsetId ?? ''}
                disabled={!data.delivery?.campaignId}
                onValueChange={(next) => {
                  const target = adsetOptions.find((item) => item.id === next);
                  onPatch({
                    delivery: {
                      action: 'create',
                      adStatus: 'PAUSED',
                      ...data.delivery,
                      adsetId: target?.id,
                      adsetName: target?.name,
                    },
                  });
                }}
              >
                <SelectTrigger aria-label="Meta ad set">
                  <SelectValue placeholder="Ad set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {adsetOptions.map((target) => (
                      <SelectItem key={target.id} value={target.id}>
                        {target.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Render history">
        <div className="flex items-center justify-between">
          <FieldDescription>
            {jobs.length === 0
              ? (data.latestOutputs?.[0]?.fileName ?? 'No renders yet.')
              : `${jobs.length} render${jobs.length === 1 ? '' : 's'}`}
          </FieldDescription>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Refresh renders"
            onClick={() => void refreshJobs()}
          >
            <RefreshCw data-icon="inline-start" aria-hidden />
            Refresh
          </Button>
        </div>
        {jobs.map((job: ApiRenderJob) => (
          <RenderJobCard
            key={job.id}
            job={job}
            onRefresh={() => void refreshOne(job.id)}
            onUseAsReference={addOutputReference}
          />
        ))}
      </InspectorSection>

      {error ? (
        <Badge variant="destructive" className="whitespace-normal">
          {error}
        </Badge>
      ) : null}
    </>
  );
}
