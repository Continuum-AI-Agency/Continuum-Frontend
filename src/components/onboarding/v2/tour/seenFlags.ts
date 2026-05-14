import { getItem, setItem, removeItem } from "@/lib/storage/brandScopedStorage";
import * as storeRegistry from "@/lib/storage/storeRegistry";
import { TOUR_NAMES, seenFlagBase, type TourName } from "./config";

const SEEN_VALUE = "1";

export function isTourSeen(tour: TourName, brandId: string): boolean {
  if (!brandId) return false;
  return getItem(seenFlagBase(tour), brandId) === SEEN_VALUE;
}

export function markTourSeen(tour: TourName, brandId: string): void {
  if (!brandId) return;
  setItem(seenFlagBase(tour), brandId, SEEN_VALUE);
}

export function clearTourSeen(tour: TourName, brandId: string): void {
  if (!brandId) return;
  removeItem(seenFlagBase(tour), brandId);
}

// Brand switching must wipe per-surface walkthrough state so a different brand
// gets its own first-run experience. brandScopedStorage already namespaces the
// keys; this teardown makes the intent explicit and survives even if the brand
// switch path stops calling purgeAllForBrand.
if (typeof window !== "undefined") {
  storeRegistry.register({
    name: "walkthrough-seen-flags",
    teardown: (prevBrandId: string) => {
      for (const tour of TOUR_NAMES) {
        removeItem(seenFlagBase(tour), prevBrandId);
      }
    },
  });
}
