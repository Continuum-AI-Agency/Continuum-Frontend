'use client';

import { canvasDeepLink, type ForgeProvenance } from '@continuum/contracts';
import { ExternalLink, RefreshCw, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { forgeDeepLinkHref } from '@/components/forge/forgeDeepLink';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// Where an asset came from: the Forge template/set/row that rendered it, and the canvas room
// and node that made or revised it — each with the way back. An asset with neither renders
// nothing, and a failed read is not worth a warning on an asset detail — it renders nothing too.

type CanvasOrigin = { label: string; action: string; href: string };

type LineageRow = {
  operation: string;
  parameters: { roomId?: unknown; nodeId?: unknown } | null;
  derived_version_id: string;
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

// Member SELECT RLS covers media.assets, media.asset_lineage and media.asset_versions, so
// the viewer's own browser client reads exactly what they may see.
async function readCanvasOrigins(brandId: string, assetId: string): Promise<CanvasOrigin[]> {
  const media = mediaSchema(createSupabaseBrowserClient());
  const [assetResult, lineageResult] = await Promise.all([
    media
      .from('assets')
      .select('origin_ref')
      .eq('brand_id', brandId)
      .eq('id', assetId)
      .maybeSingle(),
    media
      .from('asset_lineage')
      .select('operation, parameters, derived_version_id')
      .eq('brand_id', brandId)
      .eq('derived_asset_id', assetId)
      .not('parameters->>roomId', 'is', null)
      .order('created_at', { ascending: true }),
  ]);
  if (assetResult.error) throw assetResult.error;
  if (lineageResult.error) throw lineageResult.error;

  const origins = new Map<string, CanvasOrigin>();
  const originRef = (assetResult.data as { origin_ref?: Record<string, unknown> | null } | null)
    ?.origin_ref;
  const originRoom = originRef?.kind === 'canvas' ? text(originRef.roomId) : null;
  if (originRoom) {
    const href = canvasDeepLink({ roomId: originRoom, nodeId: text(originRef?.nodeId) });
    origins.set(href, { label: 'Made in canvas', action: 'Open room', href });
  }

  const rows = (lineageResult.data ?? []) as LineageRow[];
  if (rows.length === 0) return [...origins.values()];
  const { data: versions, error } = await media
    .from('asset_versions')
    .select('id, version_number')
    .in('id', [...new Set(rows.map((row) => row.derived_version_id))]);
  if (error) throw error;
  const versionNumber = new Map(
    ((versions ?? []) as Array<{ id: string; version_number: number }>).map((v) => [
      v.id,
      v.version_number,
    ]),
  );

  for (const row of rows) {
    const roomId = text(row.parameters?.roomId);
    if (!roomId) continue;
    const href = canvasDeepLink({ roomId, nodeId: text(row.parameters?.nodeId) });
    // The origin already links this room + node; a lineage edge per source would repeat it.
    if (origins.has(href)) continue;
    const version = versionNumber.get(row.derived_version_id);
    const made = row.operation === 'canvas_revision' ? 'Revised from canvas' : 'Made in canvas';
    origins.set(href, {
      label: version ? `${made} (v${version})` : made,
      action: 'Open node',
      href,
    });
  }
  return [...origins.values()];
}

export function ProvenancePanel({ brandId, assetId }: { brandId: string; assetId: string }) {
  const [provenance, setProvenance] = useState<ForgeProvenance | null>(null);
  const [canvasOrigins, setCanvasOrigins] = useState<CanvasOrigin[]>([]);

  useEffect(() => {
    let cancelled = false;
    setProvenance(null);
    setCanvasOrigins([]);
    apiRendersApi
      .getProvenance(brandId, assetId)
      .then((response) => {
        if (!cancelled) setProvenance(response.provenance);
      })
      .catch(() => undefined);
    readCanvasOrigins(brandId, assetId)
      .then((origins) => {
        if (!cancelled) setCanvasOrigins(origins);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [brandId, assetId]);

  if (!provenance && canvasOrigins.length === 0) return null;
  return (
    <>
      {provenance ? <ForgeSection provenance={provenance} /> : null}
      {canvasOrigins.length > 0 ? (
        <section
          aria-label="Canvas origin"
          data-testid="library-canvas-origin"
          className="rounded-md border border-border p-2.5"
        >
          <p className="text-3xs uppercase tracking-wide text-muted-foreground">Canvas</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-xs">
            {canvasOrigins.map((origin) => (
              <li key={origin.href} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-foreground">{origin.label}</span>
                <Link
                  href={origin.href}
                  className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                >
                  <Workflow className="size-3" aria-hidden /> {origin.action}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ForgeSection({ provenance }: { provenance: ForgeProvenance }) {
  const facts = [
    ['Template', provenance.templateName ?? provenance.templateKey],
    ['Set', provenance.renderSetName],
    ['Row', provenance.labelPath.length ? provenance.labelPath.join(' › ') : null],
    ['Format', provenance.format],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));
  const link = {
    templateAssetId: provenance.templateAssetId,
    renderSetId: provenance.renderSetId,
    rowId: provenance.rowId,
  };

  return (
    <section aria-label="Forge render" className="rounded-md border border-border p-2.5">
      <p className="text-3xs uppercase tracking-wide text-muted-foreground">Forge render</p>
      {facts.length ? (
        <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="m-0 min-w-0 truncate text-foreground" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <Link
          href={forgeDeepLinkHref(link)}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="size-3" aria-hidden /> Open in Forge
        </Link>
        {/* Re-render needs the row it came from; it opens that row selected, ready for Render. */}
        {link.templateAssetId && link.renderSetId && link.rowId ? (
          <Link
            href={forgeDeepLinkHref({ ...link, rerender: true })}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <RefreshCw className="size-3" aria-hidden /> Re-render
          </Link>
        ) : null}
      </div>
    </section>
  );
}
