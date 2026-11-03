'use client';

// The products the active brand lacks, as the post-auth layout read them from its entitlements
// (`lockedProducts` in productAccess.ts). The sidebar draws its locks from the same list; this
// hands it to anything else the shell mounts on every page, so a background read of a product
// the brand does not have is never made — the Backend would answer it 402 every time
// (PP-DT-C-unpaid-brand-polls-402-on-every-page).

import type { ProductCode } from '@continuum/contracts';
import { createContext, type ReactNode, useContext } from 'react';

const NOTHING_LOCKED: readonly ProductCode[] = [];

const LockedProductsContext = createContext<readonly ProductCode[]>(NOTHING_LOCKED);

export function LockedProductsProvider({
  products,
  children,
}: {
  products: readonly ProductCode[];
  children: ReactNode;
}) {
  return (
    <LockedProductsContext.Provider value={products}>{children}</LockedProductsContext.Provider>
  );
}

/** True when the active brand lacks `product`. Outside the shell nothing is locked. */
export function useProductLocked(product: ProductCode): boolean {
  return useContext(LockedProductsContext).includes(product);
}
