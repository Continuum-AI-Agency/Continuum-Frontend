'use client';

import type { ApiRenderInputValue, ApiRenderTemplateContract } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { Expand } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RenderPreviewPanel } from '@/components/forge/RenderPreviewPanel';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import type { RequestRow } from '@/components/forge/renderRequestRows';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRendersApi } from './apiRendersApi';

export type CanvasPreviewCase = {
  key: string;
  label: string;
  values: Record<string, ApiRenderInputValue>;
};

export function CanvasRenderPreview({
  brandId,
  bindingId,
  templateKey,
  contractHash,
  nodeId,
  cases,
  onContract,
}: {
  brandId: string;
  bindingId: string | null;
  templateKey: string;
  contractHash: string | null;
  nodeId: string;
  cases: CanvasPreviewCase[];
  onContract?: (contract: ApiRenderTemplateContract) => void;
}) {
  const [picked, setPicked] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const { data: contract, isPending, isError } = useQuery({
    queryKey: forgeQueryKeys.contract(brandId, bindingId, templateKey),
    queryFn: () => apiRendersApi.getContract(brandId, templateKey, bindingId),
    staleTime: FORGE_STALE_MS.contract,
  });
  useEffect(() => {
    if (contract && (!contractHash || contract.template.contractHash === contractHash)) {
      onContract?.(contract);
    }
  }, [contract, contractHash, onContract]);
  const chosen = cases[Math.min(picked, cases.length - 1)];
  const row: RequestRow | null = chosen
    ? {
        id: `${nodeId}:${chosen.key}`,
        parentId: null,
        label: chosen.label,
        values: chosen.values,
        clearedKeys: [],
        outputIds: [],
        media: {},
        check: { state: 'idle' },
      }
    : null;
  const preview = contract && row ? (
    <RenderPreviewPanel
      brandId={brandId}
      contract={contract}
      rows={[row]}
      rowId={row.id}
      renderSetId={null}
    />
  ) : null;

  return (
    <section className="nodrag nowheel flex min-h-64 flex-col rounded-md border border-border/60" aria-label="Pre-render preview">
      {cases.length > 1 ? (
        <label className="flex items-center gap-2 border-b border-border/60 px-2 py-1 text-2xs">
          <span>Preview</span>
          <select
            className="min-w-0 flex-1 bg-transparent"
            value={chosen?.key ?? ''}
            onChange={(event) => setPicked(cases.findIndex((item) => item.key === event.target.value))}
          >
            {cases.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="h-64 min-h-0">
        {isPending ? (
          <p className="p-3 text-2xs text-muted-foreground">Loading template preview…</p>
        ) : isError ? (
          <p className="p-3 text-2xs text-destructive">Could not load the template preview.</p>
        ) : contract && contractHash && contract.template.contractHash !== contractHash ? (
          <p className="p-3 text-2xs text-warning">The template changed. Choose it again to preview the current version.</p>
        ) : preview ? (
          expanded ? <p className="p-3 text-2xs text-muted-foreground">Preview expanded</p> : preview
        ) : (
          <p className="p-3 text-2xs text-muted-foreground">Loading saved values for this preview…</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2 py-1">
        <p className="text-2xs text-muted-foreground">
          Layout preview. Test render verifies After Effects motion, effects, and audio.
        </p>
        {preview ? (
          <Button type="button" variant="ghost" size="xs" onClick={() => setExpanded(true)}>
            <Expand className="size-3" /> Expand
          </Button>
        ) : null}
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[90vh] max-w-[92vw] flex-col overflow-hidden sm:max-w-[92vw]">
          <DialogHeader>
            <DialogTitle>{chosen?.label ?? 'Template preview'}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">{expanded ? preview : null}</div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
