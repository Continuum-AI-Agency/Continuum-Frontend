import { z } from "zod";

export const updateBrandIntegrationAccountsInputSchema = z.object({
  brandProfileId: z.string().uuid(),
  assetPks: z.array(z.string().uuid()),
});

export type UpdateBrandIntegrationAccountsInput = z.infer<
  typeof updateBrandIntegrationAccountsInputSchema
>;

export const updateBrandIntegrationAccountsResponseSchema = z.object({
  linked: z.number().int().nonnegative(),
  unlinked: z.number().int().nonnegative(),
});

export type UpdateBrandIntegrationAccountsResponse = z.infer<
  typeof updateBrandIntegrationAccountsResponseSchema
>;

