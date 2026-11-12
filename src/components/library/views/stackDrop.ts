'use client';

import type { MediaAsset } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/toast-imperative';
import { listAssetVersions, stackAssetsOperation } from '@/lib/library/creativeOperations';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Stack dropped cards onto a target as its newest versions and say which version
 * the target now shows. Resolves true when the stack landed.
 */
export async function stackDroppedAssets(
  brandId: string,
  target: MediaAsset,
  sourceAssetIds: string[],
  translate: ReturnType<typeof useTranslations<'library'>>,
): Promise<boolean> {
  const name = target.title ?? target.fileName;
  const client = createSupabaseBrowserClient();
  try {
    const result = await stackAssetsOperation(client, {
      brandId,
      targetAssetId: target.id,
      sourceAssetIds,
    });
    // The stack result names the head version but not its number; one read gets it.
    // A failed read only costs the number in the toast, never the success message.
    const versions = await listAssetVersions(client, {
      brandId,
      assetId: target.id,
    })
      .then((response) => response.versions)
      .catch(() => []);
    const head = versions.find((version) => version.id === result.headVersionId);
    toast.success(
      head
        ? translate('stackSuccessVersion', {
            name,
            version: head.versionNumber,
          })
        : translate('stackSuccess', { name }),
    );
    return true;
  } catch (error) {
    console.error('[stackDroppedAssets] failed', error);
    toast.error(translate('stackFailed', { name }));
    return false;
  }
}
