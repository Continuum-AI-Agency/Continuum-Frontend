import { z } from 'zod';

export const httpUrlSchema = z.string().trim().min(1, 'URL must not be empty.').max(2048);

export const hexColorSchema = z
  .string()
  .trim()
  .min(3)
  .max(9)
  .regex(/^#?[0-9a-fA-F]{3,8}$/u, 'Expected hex color');

export const integrationProviderEnum = z.enum([
  'youtube',
  'google-ads',
  'meta',
  'linkedin',
  'tiktok',
  'google-drive',
  'sharepoint',
  'canva',
  'figma',
]);
export type IntegrationProvider = z.infer<typeof integrationProviderEnum>;

export const normalizedDatetime = z.preprocess((value) => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return value;
}, z.string().datetime());
