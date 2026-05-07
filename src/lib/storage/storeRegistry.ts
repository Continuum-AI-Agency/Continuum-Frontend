export type StoreEntry = {
  name: string;
  teardown: (prevBrandId: string) => void;
  purge?: (prevBrandId: string) => void;
};

const entries = new Map<string, StoreEntry>();

export function register(entry: StoreEntry): () => void {
  entries.set(entry.name, entry);
  return () => {
    entries.delete(entry.name);
  };
}

export function teardown(prevBrandId: string): void {
  if (!prevBrandId) return;
  for (const entry of entries.values()) {
    try {
      entry.teardown(prevBrandId);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(`[storeRegistry] teardown failed for "${entry.name}"`, error);
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
      if (process.env.NODE_ENV !== "production") {
        console.error(`[storeRegistry] purge failed for "${entry.name}"`, error);
      }
    }
  }
}

export function reset(): void {
  entries.clear();
}

export function size(): number {
  return entries.size;
}
