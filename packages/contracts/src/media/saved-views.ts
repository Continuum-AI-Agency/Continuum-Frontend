import { z } from 'zod';
import { libraryBrowseQuerySchema } from './library-browse';

export const librarySavedViewSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    name: z.string().min(1).max(120),
    query: libraryBrowseQuerySchema,
    isShared: z.boolean(),
    createdBy: z.string().uuid().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type LibrarySavedView = z.infer<typeof librarySavedViewSchema>;

export const createLibrarySavedViewOperationSchema = z
  .object({
    action: z.literal('create_saved_view'),
    brandId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    query: libraryBrowseQuerySchema,
    isShared: z.boolean().default(false),
  })
  .strict();

export const deleteLibrarySavedViewOperationSchema = z
  .object({
    action: z.literal('delete_saved_view'),
    brandId: z.string().uuid(),
    savedViewId: z.string().uuid(),
  })
  .strict();

export const deleteLibrarySavedViewResponseSchema = z
  .object({ ok: z.literal(true), savedViewId: z.string().uuid() })
  .strict();
