'use client';

import { canvasDeepLink, type ForgeProvenance } from '@continuum/contracts';
import { ExternalLink, RefreshCw, Workflow } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { forgeDeepLinkHref } from '@/components/forge/forgeDeepLink';
import { Link } from '@/i18n/navigation';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// Where an asset came from: the Forge template/set/row that rendered it, and the canvas room
// and node that made or revised it — each with the way back. An asset with neither renders
// nothing, and a failed read is not worth a warning on an asset detail — it renders nothing too.

type CanvasOrigin = {
  kind: 'created' | 'revised';
  target: 'room' | 'node';
  version?: number;
  href: string;
};

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
    origins.set(href, { kind: 'created', target: 'room', href });
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
    const kind = row.operation === 'canvas_revision' ? 'revised' : 'created';
    origins.set(href, {
      kind,
      version,
      target: 'node',
      href,
    });
  }
  return [...origins.values()];
}

export function ProvenancePanel({ brandId, assetId }: { brandId: string; assetId: string }) {
  const translateUi = useUiTranslations('library');

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
          aria-label={translateUi('canvas_origin_82226f9a')}
          data-testid="library-canvas-origin"
          className="rounded-md border border-border p-2.5"
        >
          <p className="text-3xs uppercase tracking-wide text-muted-foreground">
            {translateUi('canvas_3824a9f4')}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 text-xs">
            {canvasOrigins.map((origin) => (
              <li key={origin.href} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-foreground">
                  {translateUi('canvasOriginLabel', {
                    kind: origin.kind,
                    version: origin.version ? String(origin.version) : 'none',
                  })}
                </span>
                <Link
                  href={origin.href}
                  className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                >
                  <Workflow className="size-3" aria-hidden />{' '}
                  {translateUi('canvasOriginAction', { target: origin.target })}
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
  const translateUi = useUiTranslations('library');

  const facts = [
    [translateUi('provenanceTemplate'), provenance.templateName ?? provenance.templateKey],
    [translateUi('provenanceSet'), provenance.renderSetName],
    [
      translateUi('provenanceRow'),
      provenance.labelPath.length ? provenance.labelPath.join(' › ') : null,
    ],
    [translateUi('provenanceFormat'), provenance.format],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));
  const link = {
    templateAssetId: provenance.templateAssetId,
    renderSetId: provenance.renderSetId,
    rowId: provenance.rowId,
  };

  return (
    <section
      aria-label={translateUi('forge_render_2ff58070')}
      className="rounded-md border border-border p-2.5"
    >
      <p className="text-3xs uppercase tracking-wide text-muted-foreground">
        {translateUi('forge_render_2ff58070')}
      </p>
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
          <ExternalLink className="size-3" aria-hidden /> {translateUi(
            'open_in_forge_37cf02a0',
          )}{' '}
        </Link>
        {/* Re-render needs the row it came from; it opens that row selected, ready for Render. */}
        {link.templateAssetId && link.renderSetId && link.rowId ? (
          <Link
            href={forgeDeepLinkHref({ ...link, rerender: true })}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <RefreshCw className="size-3" aria-hidden /> {translateUi('re_render_f6e0dcab')}{' '}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
