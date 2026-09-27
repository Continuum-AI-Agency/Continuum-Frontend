'use client';

import type { ForgeProvenance } from '@continuum/contracts';
import { ExternalLink, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { forgeDeepLinkHref } from '@/components/forge/forgeDeepLink';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// Where a Forge render came from: its template, render set and row, and the way back to them. An
// asset Forge did not render has no provenance, and a failed read is not worth a warning on an
// asset detail — both render nothing.

export function ProvenancePanel({ brandId, assetId }: { brandId: string; assetId: string }) {
  const [provenance, setProvenance] = useState<ForgeProvenance | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProvenance(null);
    apiRendersApi
      .getProvenance(brandId, assetId)
      .then((response) => {
        if (!cancelled) setProvenance(response.provenance);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [brandId, assetId]);

  if (!provenance) return null;
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
