import { z } from 'zod';

/**
 * PostgreSQL's uuid type accepts legacy/non-versioned UUID values used by some
 * of our seeded fixtures. Zod's `uuid()` validator only accepts RFC variant and
 * version bits, which made otherwise valid database rows fail at the API edge.
 *
 * Its own module so `creative-ops.ts` and `client-render.ts` can both use it
 * without importing each other — `client-render` already imports the recipe.
 * Re-exported from `client-render.ts`, which is where it used to live and where
 * every existing consumer still reaches for it.
 */
export const databaseUuidSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
