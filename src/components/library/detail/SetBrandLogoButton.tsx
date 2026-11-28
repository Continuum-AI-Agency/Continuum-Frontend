'use client';

// Makes the image on stage the brand logo: the Backend copies it into the brand's branding
// folder and points both logo_path and the brand tokens generation reads at it. Shown for
// images to the roles the Backend accepts (operator and up, as MCP set_brand_logo).

import type { MediaAsset } from '@continuum/contracts';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { useUiErrorMessage } from '@/i18n/errors';
import { setBrandLogo } from '@/lib/brands/brandLogo';
import { canEditLibrary, useBrandRole } from '@/lib/library/useBrandRole';

export type SetBrandLogoButtonProps = { brandId: string; asset: MediaAsset };

export function SetBrandLogoButton({ brandId, asset }: SetBrandLogoButtonProps) {
  const translateUi = useUiTranslations('library');
  const uiErrorMessage = useUiErrorMessage();
  const role = useBrandRole(brandId);
  const [saving, setSaving] = useState(false);

  if (asset.kind !== 'image' || !canEditLibrary(role)) return null;

  const save = async () => {
    setSaving(true);
    try {
      await setBrandLogo({ source: 'library', brandId, assetId: asset.id });
      toast.success(translateUi('brandLogoSetTitle'), {
        description: translateUi('brandLogoSetDescription'),
      });
    } catch (error) {
      console.error('[SetBrandLogoButton] set brand logo failed', error);
      toast.error(translateUi('brandLogoSetFailedTitle'), {
        description:
          (error instanceof Error && uiErrorMessage(error)) ||
          translateUi('brandLogoSetFailedDescription'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="set-brand-logo"
      disabled={saving}
      onClick={() => void save()}
      title={translateUi('setAsBrandLogoHint')}
    >
      {saving ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <BadgeCheck className="size-3.5" aria-hidden />
      )}{' '}
      {translateUi('setAsBrandLogo')}
    </Button>
  );
}
