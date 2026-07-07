// Canonical "generate a post inspired by THIS competitor post" seed reference.
// This is the single contract that both the organic generation request and the
// backend seed resolver route through, so competitor → generation never happens
// ad hoc: a tagged competitor post becomes a generation input ONE way.
//
// One of `assetId` (a saved-to-Library competitor asset — media.assets,
// source='inspiration', origin_ref.kind='competitor_organic') or `url` (a live
// Instagram permalink) identifies the post. `competitorId` scopes to a tracked
// competitor; `note` is optional free-text steer from the user.

import { z } from 'zod';

export const competitorInspirationSeedSchema = z
  .object({
    assetId: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    competitorId: z.string().min(1).optional(),
    note: z.string().max(500).optional(),
  })
  .refine((value) => Boolean(value.assetId || value.url), {
    message: 'competitorInspiration requires either assetId or url',
  });
export type CompetitorInspirationSeed = z.infer<typeof competitorInspirationSeedSchema>;
