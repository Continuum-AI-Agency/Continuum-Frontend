'use client';

// One variant the Forge agent proposed: the forge's preview of it, every change as saved → proposed,
// and the save. Nothing is written until the person saves; saving is forge_manage template_save's
// call (a new variant from the revision on screen), so a proposal saved here and one saved from an
// MCP chat are the same revision.

import type { ForgeVariantChange, ForgeVariantProposal } from '@continuum/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, TriangleAlert } from 'lucide-react';
import { useRef } from 'react';
import { LiveImage } from '@/components/forge/livePreview';
import { invalidateForgeBrand } from '@/components/forge/queryKeys';
import { rgbToHex } from '@/components/forge/TemplateLayerInspector';
import { Button } from '@/components/ui/button';
import { saveTemplateRevision } from '@/lib/library/templateSources';

const FIELD_LABEL: Record<ForgeVariantChange['field'], string> = {
  text: 'text',
  font: 'font',
  fontSize: 'size',
  fillColor: 'colour',
  visible: 'visible',
  opacity: 'opacity',
  x: 'x',
  y: 'y',
  width: 'width',
  height: 'height',
  rotation: 'rotation',
  scale: 'scale',
};

function Value({
  field,
  value,
}: {
  field: ForgeVariantChange['field'];
  value: ForgeVariantChange['to'];
}) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (field === 'fillColor' && Array.isArray(value)) {
    const hex = rgbToHex(value);
    return (
      <span className="inline-flex items-center gap-1 font-mono">
        <span className="size-3 rounded-sm border" style={{ background: hex }} aria-hidden />
        {hex}
      </span>
    );
  }
  if (typeof value === 'boolean') return <>{value ? 'on' : 'off'}</>;
  if (Array.isArray(value)) return <>{value.map((n) => Math.round(n * 100) / 100).join(' × ')}</>;
  if (typeof value === 'number') return <>{Math.round(value * 100) / 100}</>;
  return <span className="break-words">“{value}”</span>;
}

export function ForgeVariantProposalCard({
  assetId,
  brandId,
  proposal,
  onSaved,
}: {
  assetId: string;
  brandId: string;
  proposal: ForgeVariantProposal;
  onSaved?: () => Promise<void>;
}): React.ReactNode {
  const queryClient = useQueryClient();
  // One key per card: a double click or a retry replays the same save instead of forking.
  const idempotencyKey = useRef(crypto.randomUUID()).current;
  const save = useMutation({
    mutationFn: () =>
      saveTemplateRevision(assetId, {
        brandId,
        parentRevisionId: proposal.parentRevisionId,
        expectedHeadRevisionId: proposal.parentRevisionId,
        idempotencyKey,
        name: proposal.name,
        edits: proposal.edits,
        ...(proposal.compId ? { compId: proposal.compId } : {}),
      }),
    onSuccess: async () => {
      await invalidateForgeBrand(queryClient, brandId);
      await onSaved?.();
    },
  });

  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-2.5"
      data-testid="forge-variant-proposal"
    >
      <div>
        <p className="text-sm font-medium">{proposal.name}</p>
        <p className="text-xs text-muted-foreground">{proposal.rationale}</p>
      </div>
      <LiveImage
        svg={proposal.svg}
        alt={`Preview of ${proposal.name}`}
        className="max-h-48 w-full rounded-sm border bg-muted/40 object-contain"
      />
      {proposal.changes.length || proposal.edits.recolor ? (
        <table className="w-full text-xs">
          <thead className="sr-only">
            <tr>
              <th scope="col">Layer</th>
              <th scope="col">Property</th>
              <th scope="col">Saved → proposed</th>
            </tr>
          </thead>
          <tbody>
            {proposal.changes.map((change) => (
              <tr
                key={`${change.compId}:${change.layerId}:${change.field}`}
                className="border-t align-top"
              >
                <td className="py-1 pr-2 font-medium">{change.layer}</td>
                <td className="py-1 pr-2 text-muted-foreground">{FIELD_LABEL[change.field]}</td>
                <td className="py-1">
                  <span className="line-through opacity-70">
                    <Value field={change.field} value={change.from} />
                  </span>
                  {' → '}
                  <Value field={change.field} value={change.to} />
                </td>
              </tr>
            ))}
            {proposal.edits.recolor ? (
              <tr className="border-t align-top">
                <td className="py-1 pr-2 font-medium">Every layer</td>
                <td className="py-1 pr-2 text-muted-foreground">colours</td>
                <td className="py-1">
                  <span className="line-through opacity-70">as saved</span>
                  {' → '}
                  <span className="inline-flex items-center gap-1 align-middle">
                    {proposal.edits.recolor.palette.map((hex) => (
                      <span
                        key={hex}
                        className="size-3.5 rounded-sm border"
                        style={{ background: hex }}
                        title={hex}
                      />
                    ))}
                    <span className="sr-only">{proposal.edits.recolor.palette.join(', ')}</span>
                  </span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
      {proposal.warnings.map((warning) => (
        <p key={warning} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          {warning}
        </p>
      ))}
      {save.isSuccess ? (
        <p className="flex items-center gap-1.5 text-xs" role="status">
          <Check className="size-3.5" aria-hidden />
          Saved as variant “{proposal.name}” (revision {save.data.number}).
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save as variant'}
          </Button>
          {save.isError ? (
            <span className="text-xs text-destructive" role="alert">
              {save.error instanceof Error ? save.error.message : 'Could not save the variant.'}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
