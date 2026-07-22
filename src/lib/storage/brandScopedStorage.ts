const SCOPE_DELIMITER = ':b:';

export function makeKey(base: string, brandId: string): string {
  if (!brandId) {
    throw new Error('brandScopedStorage.makeKey: brandId is required');
  }
  return `${base}${SCOPE_DELIMITER}${brandId}`;
}

function getStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function getItem(base: string, brandId: string): string | null {
  const store = getStore();
  if (!store) return null;
  return store.getItem(makeKey(base, brandId));
}

export function setItem(base: string, brandId: string, value: string): void {
  const store = getStore();
  if (!store) return;
  store.setItem(makeKey(base, brandId), value);
}

export function removeItem(base: string, brandId: string): void {
  const store = getStore();
  if (!store) return;
  store.removeItem(makeKey(base, brandId));
}

export function purgeAllForBrand(brandId: string): void {
  const store = getStore();
  if (!store) return;
  const suffix = `${SCOPE_DELIMITER}${brandId}`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key && key.endsWith(suffix)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) store.removeItem(key);
}

export function purgeOrphans(activeBrandId: string, knownBrandIds: ReadonlySet<string>): void {
  const store = getStore();
  if (!store) return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key) continue;
    const idx = key.lastIndexOf(SCOPE_DELIMITER);
    if (idx === -1) continue;
    const brandId = key.slice(idx + SCOPE_DELIMITER.length);
    if (brandId === activeBrandId) continue;
    if (!knownBrandIds.has(brandId)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) store.removeItem(key);
}

export function migrateLegacyKey(legacyKey: string, base: string, brandId: string): boolean {
  const store = getStore();
  if (!store) return false;
  const legacyValue = store.getItem(legacyKey);
  if (legacyValue === null) return false;
  const scopedKey = makeKey(base, brandId);
  if (store.getItem(scopedKey) === null) {
    store.setItem(scopedKey, legacyValue);
  }
  store.removeItem(legacyKey);
  return true;
}
