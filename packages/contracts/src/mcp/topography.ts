import { z } from "zod";

// The account "topography" surfaced by the MCP `account_map` tool: the brand →
// linked platforms → accounts structure the in-app dashboards render. Shared so
// the Backend validates exactly what it emits (and any future Frontend mirror
// validates the same). snake_case mirrors the sibling MCP contracts + the
// accounts_list / integrations_list RPC shapes it composes.

export const topographyAccountSchema = z.object({
  account_id: z.string(),
  platform: z.string(),
  handle: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  account_type: z.string().nullable().optional(),
  follower_count: z.number().nullable().optional(),
  // What the account can do (e.g. publish, insights) — the most useful signal
  // for an orientation tool deciding which downstream calls are possible.
  capabilities: z.array(z.string()).optional(),
});
export type TopographyAccount = z.infer<typeof topographyAccountSchema>;

// A paid ad account (Meta `act_<id>` / Google Ads customer id). `account_id` is
// the external identifier the paid analytics tools require — not the asset UUID.
export const topographyAdAccountSchema = z.object({
  platform: z.enum(["meta_ads", "google_ads"]),
  account_id: z.string(),
  name: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
});
export type TopographyAdAccount = z.infer<typeof topographyAdAccountSchema>;

export const topographyPlatformSchema = z.object({
  platform: z.string(),
  // Connected + healthy for this brand (active integration, no reauth needed).
  linked: z.boolean(),
  status: z.string().optional(),
  needs_reauth: z.boolean().optional(),
  account_count: z.number(),
  // Present when depth >= "accounts".
  accounts: z.array(topographyAccountSchema).optional(),
});
export type TopographyPlatform = z.infer<typeof topographyPlatformSchema>;

export const brandTopographyDepthSchema = z.enum(["platforms", "accounts"]);
export type BrandTopographyDepth = z.infer<typeof brandTopographyDepthSchema>;

export const brandTopographySchema = z.object({
  brand_id: z.string(),
  brand_name: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  depth: brandTopographyDepthSchema,
  platforms: z.array(topographyPlatformSchema),
  // Connected paid ad accounts (read-only; populated at depth >= "accounts").
  // The id here is the one analytics_query needs to query paid performance.
  ad_accounts: z.array(topographyAdAccountSchema).optional(),
});
export type BrandTopography = z.infer<typeof brandTopographySchema>;
