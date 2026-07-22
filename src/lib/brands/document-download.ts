export function normalizeBrandDocumentStoragePath(storagePath: string): string {
  const rawPath = storagePath.trim();
  if (!rawPath) {
    throw new Error('Storage path is required');
  }

  let normalizedPath = rawPath;
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    try {
      normalizedPath = new URL(rawPath).pathname;
    } catch {
      normalizedPath = rawPath;
    }
  }

  normalizedPath = decodeURIComponent(normalizedPath).replace(/^\/+/, '');
  const bucketSegment = 'brand-docs/';
  const bucketIndex = normalizedPath.indexOf(bucketSegment);
  if (bucketIndex >= 0) {
    normalizedPath = normalizedPath.slice(bucketIndex + bucketSegment.length);
  }

  normalizedPath = normalizedPath.replace(/^\/+/, '');
  if (!normalizedPath) {
    throw new Error('Storage path is required');
  }

  return normalizedPath;
}
