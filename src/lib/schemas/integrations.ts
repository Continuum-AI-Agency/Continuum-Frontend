import { z } from "zod";

const integrationSyncResponseBase = z.object({
  url: z.string().url(),
});

export const metaSyncResponseSchema = integrationSyncResponseBase;

export const googleSyncResponseSchema = integrationSyncResponseBase.extend({
  state: z.string().min(1),
});

export const googleDrivePickerResponseSchema = integrationSyncResponseBase.extend({
  state: z.string().min(1),
});

export type MetaSyncResponse = z.infer<typeof metaSyncResponseSchema>;
export type GoogleSyncResponse = z.infer<typeof googleSyncResponseSchema>;
export type GoogleDrivePickerResponse = z.infer<typeof googleDrivePickerResponseSchema>;
