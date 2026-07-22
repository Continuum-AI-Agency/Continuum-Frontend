import { useEffect, useRef } from 'react';
import type { BrandSwitchEvent } from '@/lib/storage/storeRegistry';
import * as storeRegistry from '@/lib/storage/storeRegistry';

export type { BrandSwitchEvent, BrandSwitchReason } from '@/lib/storage/storeRegistry';

export function onBrandChange(handler: (event: BrandSwitchEvent) => void): () => void {
  return storeRegistry.subscribe(handler);
}

export function useBrandChange(handler: (event: BrandSwitchEvent) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return onBrandChange((event) => handlerRef.current(event));
  }, []);
}

export function registerBrandScopedStore(opts: {
  name: string;
  reset: () => void;
  purge?: () => void;
}): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  return storeRegistry.register({
    name: opts.name,
    teardown: () => {
      try {
        opts.reset();
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(`[brand-switch] reset failed for "${opts.name}"`, error);
        }
      }
    },
    purge: opts.purge
      ? () => {
          try {
            opts.purge!();
          } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
              console.error(`[brand-switch] purge failed for "${opts.name}"`, error);
            }
          }
        }
      : undefined,
  });
}
