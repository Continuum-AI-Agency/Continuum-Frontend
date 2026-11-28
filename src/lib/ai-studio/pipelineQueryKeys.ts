// Kept apart from pipelines.ts: importing a query key from there pulled the whole pipeline
// manifest contract graph (~200 KiB) into /scale's first load just to invalidate a cache entry.
export const pipelineCapabilitiesQueryKey = (brandProfileId?: string) =>
  ['pipeline-capabilities', brandProfileId] as const;
