import { switchActiveBrandAction } from '@/app/(post-auth)/settings/actions';

export type SwitchBrandOptions = {
  targetBrandId?: string;
  activeBrandId?: string;
  refresh?: () => void;
};

export async function switchBrand({
  targetBrandId,
  activeBrandId,
  refresh,
}: SwitchBrandOptions): Promise<boolean> {
  if (!targetBrandId) return false;
  if (targetBrandId === activeBrandId) return false;

  await switchActiveBrandAction(targetBrandId);
  refresh?.();
  return true;
}
