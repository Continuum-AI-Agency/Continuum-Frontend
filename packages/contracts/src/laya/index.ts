import { z } from 'zod';

/**
 * Wake the self-hosted Laya decision service before a person needs it.
 *
 * Laya scales to zero and a cold instance takes ~97s to load its checkpoints,
 * so an interactive caller (canvas edits, Forge variations) pings this the
 * moment someone opens an AI input. The Backend debounces and fires one health
 * request at the service; the browser never waits on the result. Idle warmth
 * is free — the service bills only while a request is running.
 */
export const LAYA_WARM_ROUTE = '/api/laya/warm';

export const layaWarmResponseSchema = z
  .object({
    /** True when this call started a wake-up; false when one ran recently. */
    warming: z.boolean(),
  })
  .strict();
export type LayaWarmResponse = z.infer<typeof layaWarmResponseSchema>;
