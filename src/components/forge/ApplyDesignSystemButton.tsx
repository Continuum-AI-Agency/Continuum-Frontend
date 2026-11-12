'use client';

// "Apply my design system": one tap branches a Brand-aligned variant of the revision on screen —
// accents moved to the brand's colours, text set in its faces — through the same save the Layers
// tab uses. The edits come from `brandAlignmentEdits` (contracts), so a person and an agent asking
// for the same thing get the same variant.

import {
  type BrandAlignmentReport,
  brandAlignmentEdits,
  type TemplateRevision,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Palette } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { brandTypeInputsQueryKey, loadBrandTypeInputs } from '@/lib/brands/brandTypeInputs.client';
import {
  editableTemplateFonts,
  fetchTemplateLayerInventory,
  saveTemplateRevision,
} from '@/lib/library/templateSources';
import { invalidateForgeBrand } from './queryKeys';

export const BRAND_ALIGNED_VARIANT_NAME = 'Brand-aligned';

function describe(report: BrandAlignmentReport): string {
  const type =
    report.retyped && report.display
      ? `${report.retyped} text ${report.retyped === 1 ? 'layer' : 'layers'} set in ${report.display}${report.body && report.body !== report.display ? ` and ${report.body}` : ''}.`
      : null;
  const first = report.skipped[0];
  const kept = first
    ? `${report.skipped.length} kept their face — ${first.layerName}: ${first.reason}`
    : null;
  return [
    report.palette.length ? 'Accents moved to your brand colours.' : 'No brand colours to apply.',
    type,
    kept,
  ]
    .filter(Boolean)
    .join(' ');
}

export function ApplyDesignSystemButton({
  brandId,
  assetId,
  revision,
  designImport,
  onCreated,
}: {
  brandId: string;
  assetId: string;
  /** The revision on screen: the new variant branches from it. */
  revision: TemplateRevision;
  /** A Photoshop or Illustrator import, whose text is addressed by design layer id. */
  designImport: boolean;
  onCreated: (saved: TemplateRevision) => void | Promise<void>;
}) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('forge');

  const queryClient = useQueryClient();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  // One key per intent: a retry after a lost answer replays the same save rather than branching twice.
  const intent = useRef<{ revisionId: string; key: string } | null>(null);

  const apply = async () => {
    setBusy(true);
    try {
      const [brand, fonts, inventory] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: brandTypeInputsQueryKey(brandId),
          queryFn: () => loadBrandTypeInputs(brandId),
        }),
        queryClient.fetchQuery({
          queryKey: ['forge-layer-fonts', brandId],
          queryFn: () => editableTemplateFonts(brandId),
        }),
        fetchTemplateLayerInventory(brandId, revision.sourceAssetId, revision.sourceVersionId),
      ]);
      const { edits, report } = brandAlignmentEdits({
        layers: inventory.layers,
        fonts,
        brand,
        designImport,
      });
      if (!edits.recolor && !edits.layers.length) {
        show({
          title: translateUi('nothing_to_apply_14428d8e'),
          description:
            report.skipped[0]?.reason ??
            translateUi('add_colours_or_typefaces_to_your_de_4bbff051'),
          variant: 'info',
        });
        return;
      }
      if (intent.current?.revisionId !== revision.id)
        intent.current = { revisionId: revision.id, key: crypto.randomUUID() };
      const saved = await saveTemplateRevision(assetId, {
        brandId,
        parentRevisionId: revision.id,
        expectedHeadRevisionId: revision.id,
        idempotencyKey: intent.current.key,
        name: BRAND_ALIGNED_VARIANT_NAME,
        tags: ['brand_aligned'],
        edits,
      });
      intent.current = null;
      await invalidateForgeBrand(queryClient, brandId);
      show({
        title: translateUi('brand_aligned_variant_created_1f537d12'),
        description: describe(report),
        variant: report.skipped.length ? 'warning' : 'success',
      });
      await onCreated(saved);
    } catch (error) {
      show({
        title: translateUi('could_not_apply_your_design_system_a02e29f0'),
        description: uiErrorText(error),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      disabled={busy}
      onClick={() => void apply()}
    >
      <Palette className="size-3.5" aria-hidden />
      {busy
        ? translateUi('applying_design_system_0bcddb23')
        : translateUi('apply_my_design_system_cec958b3')}
    </Button>
  );
}
