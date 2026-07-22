export type BrandSwitchReason = 'local-switch' | 'cross-tab-sync';

export type BrandSwitchEvent = {
  prevBrandId: string;
  nextBrandId: string | null;
  reason: BrandSwitchReason;
};

export type StoreEntry = {
  name: string;
  teardown: (prevBrandId: string, event?: BrandSwitchEvent) => void;
  purge?: (prevBrandId: string) => void;
};

export type Subscriber = (event: BrandSwitchEvent) => void;

const entries = new Map<string, StoreEntry>();
const subscribers = new Set<Subscriber>();

export function register(entry: StoreEntry): () => void {
  entries.set(entry.name, entry);
  return () => {
    entries.delete(entry.name);
  };
}

export function subscribe(handler: Subscriber): () => void {
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
}

export function teardown(prevBrandId: string, event?: BrandSwitchEvent): void {
  if (!prevBrandId) return;
  const evt: BrandSwitchEvent = event ?? { prevBrandId, nextBrandId: null, reason: 'local-switch' };
  for (const entry of entries.values()) {
    try {
      entry.teardown(prevBrandId, evt);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[storeRegistry] teardown failed for "${entry.name}"`, error);
      }
    }
  }
  for (const handler of subscribers) {
    try {
      handler(evt);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[storeRegistry] subscriber failed', error);
      }
    }
  }
}

export function purge(prevBrandId: string): void {
  if (!prevBrandId) return;
  for (const entry of entries.values()) {
    if (!entry.purge) continue;
    try {
      entry.purge(prevBrandId);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[storeRegistry] purge failed for "${entry.name}"`, error);
      }
    }
  }
}

export function reset(): void {
  entries.clear();
  subscribers.clear();
}

export function size(): number {
  return entries.size;
}

export function subscriberCount(): number {
  return subscribers.size;
}
