'use client';

import type { ForgeLineageNode, ForgeLineageView } from '@continuum/contracts';
import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@/components/approvals/formatters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchTemplateLineage } from '@/lib/library/templateSources';
import { shortSha, variantLabel } from './templateVersion';

/**
 * The template's VARIANTS — its named heads.
 *
 * A variant is a sibling version that differs deliberately: a ratio, a language, a legal wrap, a
 * motion preset. Same lineage, its own ref. Until now they had no representation anywhere in the
 * Forge at all: the gallery showed flat ratio chips, the Render tab's "forks" are forks of DATA,
 * and the only way to know which forks existed for a template was to read a delivery spec.
 *
 * Built from the version tree's refs rather than a new route, because a named head IS the variant
 * — `<templateKey>/<ratio>/<class>[@state]`. See template-forge `docs/TEMPLATE_IDENTITY.md`.
 */

export type VariantRow = {
  sha: string;
  refs: string[];
  /** `9:16/base` out of `inyogo/9:16/base` — the repo key is tenant-scoped noise in a list. */
  name: string;
  state: string | null;
  accepted: boolean;
  shippedAs: number | null;
  /** The last pointer move recorded for these bytes, if the store has one. */
  lastPointer: { direction: string; at: string; attachment: number | null } | null;
};

function tagString(tags: Record<string, unknown>, key: string): string | null {
  const value = tags[key];
  return typeof value === 'string' ? value : null;
}

/** Every node in the forest that carries a ref, flattened, deepest last. */
export function variantsOf(view: Pick<ForgeLineageView, 'roots'>): VariantRow[] {
  const out: VariantRow[] = [];
  const walk = (node: ForgeLineageNode) => {
    if (node.refs.length) {
      const tags = (node.tags ?? {}) as Record<string, unknown>;
      const shipped = tags.shipped as { attachmentId?: number } | undefined;
      const pointer = Array.isArray(tags.pointer)
        ? (tags.pointer as Array<{ direction?: string; at?: string; attachment?: number | null }>)
        : [];
      const last = pointer.length ? pointer[pointer.length - 1] : null;
      out.push({
        sha: node.sha,
        refs: node.refs,
        name: variantLabel(node.refs[0]),
        state: tagString(tags, 'state'),
        accepted: tags['ae-accepted'] === true,
        shippedAs: typeof shipped?.attachmentId === 'number' ? shipped.attachmentId : null,
        lastPointer: last
          ? {
              direction: last.direction ?? 'moved',
              at: last.at ?? '',
              attachment: last.attachment ?? null,
            }
          : null,
      });
    }
    for (const child of node.children) walk(child);
  };
  for (const root of view.roots) walk(root);
  return out;
}

export function VariantsPanel({
  brandId,
  assetId,
  selectedRef,
  onSelect,
}: {
  brandId: string;
  assetId: string;
  /** The head the Render tab is currently pinned to, or null for the template's live pointer. */
  selectedRef?: string | null;
  /**
   * Pick this head for the next render, or unpick it. Omitted, the panel stays read-only —
   * which is what it was before, and is still right anywhere there is no render to aim at.
   */
  onSelect?: (ref: string | null) => void;
}) {
  const [view, setView] = useState<ForgeLineageView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchTemplateLineage(brandId, assetId)
      .then((answer) => live && setView(answer))
      .catch(
        (cause: unknown) =>
          live && setError(cause instanceof Error ? cause.message : String(cause)),
      );
    return () => {
      live = false;
    };
  }, [brandId, assetId]);

  if (error) {
    return <p className="text-xs text-muted-foreground">Could not read the variants. {error}</p>;
  }
  if (!view) return <p className="text-xs text-muted-foreground">Reading the variants…</p>;
  // A mirrored tree still lists the variants; only no forge AND no mirror has nothing to show.
  if (!view.connected && !view.cachedAt) {
    return (
      <p className="text-xs text-muted-foreground">
        Variants are not connected — Template Forge is not configured for this environment.
      </p>
    );
  }

  const variants = variantsOf(view);
  if (!variants.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No named variants yet. A variant appears here once a fork is given a name — a ratio, a
        language, a legal wrap or a motion preset.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {view.cachedAt ? (
        <li className="text-xs text-muted-foreground" title={view.cachedAt}>
          Showing the last variants Template Forge reported, from{' '}
          {formatRelativeTime(view.cachedAt)}.
        </li>
      ) : null}
      {variants.map((variant) => (
        <li
          key={variant.sha}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
        >
          <span className="font-medium" title={variant.refs.join(' · ')}>
            {variant.name}
          </span>
          <span className="font-mono text-muted-foreground tabular-nums" title={variant.sha}>
            {shortSha(variant.sha)}
          </span>
          {variant.state ? <Badge variant="secondary">{variant.state}</Badge> : null}
          {variant.accepted ? <Badge variant="secondary">AE accepted</Badge> : null}
          {variant.shippedAs !== null ? (
            <Badge variant="secondary" title={`attachment ${variant.shippedAs}`}>
              shipped
            </Badge>
          ) : null}
          {/* The pointer is the one mutable thing in the pipeline and it is live for everyone, so
              the last move it made is worth showing beside the variant it moved to. */}
          {variant.lastPointer ? (
            <span className="text-muted-foreground" title={variant.lastPointer.at}>
              pointer {variant.lastPointer.direction}
            </span>
          ) : null}
          {/* The panel could list heads and never render one, which made every name on it
              decoration. Choosing one OVERRIDES the template's live pointer for the next
              render — so it is a toggle with a visible pinned state, not a fire-and-forget
              button someone could press twice without knowing what changed. */}
          {onSelect && variant.refs[0] ? (
            <Button
              type="button"
              size="sm"
              variant={selectedRef === variant.refs[0] ? 'default' : 'outline'}
              className="ml-auto h-6 px-2 text-xs"
              onClick={() => onSelect(selectedRef === variant.refs[0] ? null : variant.refs[0])}
            >
              {selectedRef === variant.refs[0] ? 'Rendering this' : 'Render this'}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
