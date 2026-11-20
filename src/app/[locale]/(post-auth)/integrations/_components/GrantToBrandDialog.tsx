'use client';

import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { grantIntegrationToBrandAction } from '@/app/[locale]/(post-auth)/settings/integrations/actions';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/ToastProvider';
import { useRouter } from '@/i18n/navigation';

type GrantToBrandDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  integrationLabel: string;
  alreadyGrantedBrandIds?: ReadonlySet<string>;
};

type EligibleBrand = {
  id: string;
  name: string;
};

export function GrantToBrandDialog({
  open,
  onOpenChange,
  integrationId,
  integrationLabel,
  alreadyGrantedBrandIds,
}: GrantToBrandDialogProps) {
  const tUi = useTranslations('settings');
  const uiLocale = useLocale();
  const router = useRouter();
  const checkboxPrefix = React.useId();
  const { brandSummaries, permissions } = useActiveBrandContext();
  const { show } = useToast();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const eligibleBrands: EligibleBrand[] = React.useMemo(() => {
    const ownerOrAdminBrandIds = new Set(
      permissions
        .filter((p) => p.role === 'owner' || p.role === 'admin')
        .map((p) => p.brand_profile_id),
    );

    return brandSummaries
      .filter((brand) => !brand.isPending)
      .filter((brand) => ownerOrAdminBrandIds.has(brand.id))
      .map((brand) => ({ id: brand.id, name: brand.name }));
  }, [brandSummaries, permissions]);

  React.useEffect(() => {
    if (!open) setSelected(new Set());
  }, [open]);

  const toggle = (brandId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      onOpenChange(false);
      return;
    }
    setIsSubmitting(true);
    const ids = Array.from(selected);
    const failures: string[] = [];

    await Promise.all(
      ids.map(async (brandId) => {
        try {
          await grantIntegrationToBrandAction(brandId, integrationId);
        } catch (error) {
          const brandName = eligibleBrands.find((b) => b.id === brandId)?.name ?? brandId;
          failures.push(brandName);
          if (process.env.NODE_ENV !== 'production') {
            console.error(`[GrantToBrandDialog] grant failed for ${brandId}`, error);
          }
        }
      }),
    );

    setIsSubmitting(false);

    if (failures.length === 0) {
      show({
        title: tUi('m_2c5e9cb9eb'),
        description: tUi('m_d843e519a7', { integration: integrationLabel, count: ids.length }),
      });
      onOpenChange(false);
      router.refresh();
      return;
    }

    show({
      title: tUi('m_8efdead222'),
      description: tUi('m_e4432f91b5', { brands: new Intl.ListFormat(uiLocale).format(failures) }),
      variant: 'error',
    });
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tUi('m_267d61146e')}</DialogTitle>
          <DialogDescription>
            {tUi.rich('m_2a2a1cf95d', {
              integration: () => <span className="font-medium">{integrationLabel}</span>,
            })}
          </DialogDescription>
        </DialogHeader>

        {eligibleBrands.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{tUi('m_e23d926c77')}</p>
        ) : (
          <div className="flex flex-col gap-2 py-2 max-h-72 overflow-y-auto">
            {eligibleBrands.map((brand) => {
              const isAlreadyGranted = alreadyGrantedBrandIds?.has(brand.id) ?? false;
              const isChecked = isAlreadyGranted || selected.has(brand.id);
              return (
                <label
                  key={brand.id}
                  htmlFor={`${checkboxPrefix}-${brand.id}`}
                  className={`flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 ${
                    isAlreadyGranted
                      ? 'opacity-60 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-accent/40'
                  }`}
                >
                  <Checkbox
                    id={`${checkboxPrefix}-${brand.id}`}
                    checked={isChecked}
                    disabled={isAlreadyGranted || isSubmitting}
                    onCheckedChange={() => toggle(brand.id)}
                  />
                  <span className="flex-1 text-sm">{brand.name}</span>
                  {isAlreadyGranted ? (
                    <span className="text-xs text-muted-foreground">{tUi('m_015aef3626')}</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {tUi('m_77dfd2135f')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || selected.size === 0 || eligibleBrands.length === 0}
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : tUi('m_6c7847a0cd')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
