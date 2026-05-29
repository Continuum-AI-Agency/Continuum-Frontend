// Reference: the pattern for a shared HTTP contract. Commented out so it
// doesn't show up in the package's public exports until adopted.
//
// To use: uncomment, rename to e.g. organic/runs.ts, add to ../index.ts.

/*
import { z } from 'zod';

// Request body for POST /api/organic/runs (Backend) and useStartOrganicRun (FE)
export const createOrganicRunRequestSchema = z.object({
  brandId: z.string().uuid(),
  platforms: z.array(z.enum(['instagram', 'facebook', 'tiktok', 'linkedin'])).min(1),
  weekOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO date YYYY-MM-DD'),
});
export type CreateOrganicRunRequest = z.infer<typeof createOrganicRunRequestSchema>;

// Per-frame schema for the NDJSON v2 stream the Backend writes
export const organicRunFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('platform.started'), platform: z.string() }),
  z.object({ type: z.literal('post.draft'), platform: z.string(), draft: z.unknown() }),
  z.object({ type: z.literal('platform.done'), platform: z.string() }),
  z.object({ type: z.literal('run.error'), message: z.string() }),
]);
export type OrganicRunFrame = z.infer<typeof organicRunFrameSchema>;
*/

export {};
