import { z } from "zod";

export const providerEnum = z.enum([
	"instagram",
	"youtube",
	"tiktok",
	"x",
	"facebook",
	"linkedin",
]);
export type Provider = z.infer<typeof providerEnum>;

export const assetSchema = z.object({
	provider: providerEnum,
	assetId: z.string(),
	displayName: z.string().min(1),
	handle: z.string().optional(),
	avatarUrl: z.string().url().optional(),
	connected: z.boolean(),
	included: z.boolean().default(false),
	lastSyncedAt: z.string().datetime().optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const assetsResponseSchema = z.object({ assets: z.array(assetSchema) });

export const updateAssetsInputSchema = z.object({
	assets: z.array(
		z.object({ provider: providerEnum, assetId: z.string() })
	),
});


