import { z } from 'zod';

// Boundary schema for the in-app "What's New" changelog. Entries live in the
// public.whats_new Supabase table, are written by `bun run whats-new:add`
// (service-role), and are read by the dashboard header popover. Both the writer
// and the Frontend reader validate against this one schema, so the row shape can
// never drift between producer and consumer. `id` is the stable slug
// ("YYYY-MM-DD-topic") the client keys read-state on; ids are never reused.

export const WHATS_NEW_TAGS = ['new', 'improved', 'fixed'] as const;

const whatsNewEntryFields = {
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1),
  body: z.string().min(1),
  tag: z.enum(WHATS_NEW_TAGS).optional(),
};

export const whatsNewEntrySchema = z.object(whatsNewEntryFields);

// `created_at` is the database-generated publication timestamp. The write
// command intentionally omits it so Postgres remains the clock authority.
export const whatsNewReadEntrySchema = z.object({
  ...whatsNewEntryFields,
  createdAt: z.string().datetime({ offset: true }),
});

export const whatsNewChangelogSchema = z.array(whatsNewEntrySchema);
export const whatsNewReadChangelogSchema = z.array(whatsNewReadEntrySchema);

export type WhatsNewTag = (typeof WHATS_NEW_TAGS)[number];
export type WhatsNewEntry = z.infer<typeof whatsNewEntrySchema>;
export type WhatsNewReadEntry = z.infer<typeof whatsNewReadEntrySchema>;
