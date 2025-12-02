export type SwitchBrandOptions = {
  targetBrandId?: string;
  activeBrandId?: string;
  switchAction: (brandId: string) => Promise<void> | void;
  refresh?: () => void;
};

/**
 * Switches the active brand only when the selected brand differs from the current one.
 * Returns true when a switch was performed so callers can decide whether to refresh.
 */
export async function switchBrand({
  targetBrandId,
  activeBrandId,
  switchAction,
  refresh,
}: SwitchBrandOptions): Promise<boolean> {
  if (!targetBrandId) {
    return false;
  }

  if (targetBrandId === activeBrandId) {
    return false;
  }

  await switchAction(targetBrandId);
  refresh?.();
  return true;
}
