'use client';

import type { TemplateAuthoringWorkingCopy, TemplateRevisionVariant } from '@continuum/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { listTemplateAuthoringWorkingCopies } from '@/lib/library/templateSources';
import { listTemplateDraftRecoveries, type TemplateDraftRecovery } from './templateDraftRecovery';

/** Earlier contexts stay inspectable; their commands are never replayed into another base. */
export function TemplateWorkingCopyContext({ copy, variant }: {
  copy: TemplateAuthoringWorkingCopy;
  variant: TemplateRevisionVariant | undefined;
}) {
  const [previous, setPrevious] = useState<Array<{ copy: TemplateAuthoringWorkingCopy; recoveries: TemplateDraftRecovery[] }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = variant?.revisions.find((revision) => revision.id === copy.baseRevisionId);
  const advanced = !!variant && variant.draftHeadRevisionId !== copy.baseRevisionId;
  const load = async () => {
    setError(null);
    try {
      const copies = await listTemplateAuthoringWorkingCopies(copy.templateId, copy.brandId, copy.variantId, copy.principalId);
      const rows = await Promise.all(copies.filter((item) => item.id !== copy.id).map(async (item) => ({
        copy: item,
        recoveries: await listTemplateDraftRecoveries(item.principalId, { brandId: item.brandId, assetId: item.sourceAssetId,
          baseVersionId: item.sourceVersionId, workingCopyId: item.id }),
      })));
      setPrevious(rows);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Earlier private copies could not be read.'); }
  };
  return <div className="mb-3 flex flex-col gap-1 text-xs" data-working-copy-id={copy.id} data-base-revision-id={copy.baseRevisionId}>
    <p role="status">Private working copy · {variant?.name ?? 'Variant'} · Base {base ? `revision ${base.number}` : copy.baseRevisionId.slice(0, 8)}</p>
    {advanced && <p className="text-muted-foreground">The branch has advanced. This copy retains its captured base; save as a new variant before comparing or merging.</p>}
    <details onToggle={(event) => { if (event.currentTarget.open && previous === null) void load(); }}>
      <summary className="cursor-pointer text-muted-foreground">Earlier private copies</summary>
      {error && <div role="alert">{error} <Button size="xs" variant="outline" onClick={() => void load()}>Retry</Button></div>}
      {previous && !previous.length && <p className="py-1 text-muted-foreground">No earlier working copies.</p>}
      {previous?.map((row) => <div key={row.copy.id} className="my-2 rounded-md border p-2">
        <p>{row.copy.closedAt ? 'Saved copy' : 'Retained copy'} · <span className="font-mono">{row.copy.id.slice(0, 8)}</span></p>
        <p className="text-muted-foreground">Base <span className="font-mono">{row.copy.baseRevisionId.slice(0, 8)}</span> · {row.recoveries.length} local recovery snapshots</p>
        {row.recoveries.map((recovery) => <details key={recovery.id} className="mt-1">
          <summary className="cursor-pointer">Review retained local changes · {recovery.commands.length} commands</summary>
          <p className="text-muted-foreground">These commands belong to this earlier copy. Reconcile their exact base before applying them elsewhere.</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-2xs">{JSON.stringify(recovery.commands, null, 2)}</pre>
        </details>)}
      </div>)}
    </details>
  </div>;
}
