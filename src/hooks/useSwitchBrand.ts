'use client';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { usePathname, useRouter } from '@/i18n/navigation';
import { purgeAllForBrand } from '@/lib/storage/brandScopedStorage';
import * as storeRegistry from '@/lib/storage/storeRegistry';

export type SwitchBrandOutcome = {
  switched: boolean;
  prevBrandId: string;
  redirected: boolean;
};

export function useSwitchBrand() {
  const uiText = useTranslations('common');
  const { selectBrand, brandSummaries } = useActiveBrandContext();
  const { show } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    async (brandId: string): Promise<SwitchBrandOutcome> => {
      const result = await selectBrand(brandId);

      if (!result.switched) {
        return { switched: false, prevBrandId: result.prevBrandId, redirected: false };
      }

      const event = {
        prevBrandId: result.prevBrandId,
        nextBrandId: brandId,
        reason: 'local-switch' as const,
      };

      try {
        storeRegistry.teardown(result.prevBrandId, event);
      } catch {
        /* swallowed by registry handlers */
      }

      try {
        purgeAllForBrand(result.prevBrandId);
      } catch {
        /* purge failures should never block a switch */
      }

      const onboarding = pathname?.startsWith('/onboarding') ?? false;
      if (onboarding) {
        const targetBrand = brandSummaries.find((b) => b.id === brandId);
        router.push(targetBrand && !targetBrand.completed ? `/onboarding?brand=${brandId}` : '/');
      }

      try {
        storeRegistry.purge(result.prevBrandId);
      } catch {
        /* swallowed by registry handlers */
      }

      const next = brandSummaries.find((b) => b.id === brandId);
      if (next) {
        show({
          title: uiText('switched_brand_18c8220'),
          description: uiText('nowViewingBrand', { name: next.name }),
          variant: 'success',
        });
      }

      return { switched: true, prevBrandId: result.prevBrandId, redirected: onboarding };
    },
    [selectBrand, router, pathname, show, brandSummaries, uiText],
  );
}
