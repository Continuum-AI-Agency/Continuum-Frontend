import { z } from 'zod';

// Boundary schema for the in-app "What's New" changelog. Entries are authored as
// a raw array in src/content/changelog.ts and validated here, so a malformed
// entry (bad date, empty title) fails loudly at parse time rather than rendering
// garbage in the header popover.

export const CHANGELOG_TAGS = ['new', 'improved', 'fixed'] as const;

export const changelogEntrySchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1),
  body: z.string().min(1),
  tag: z.enum(CHANGELOG_TAGS).optional(),
});

export const changelogSchema = z.array(changelogEntrySchema);

export type ChangelogEntry = z.infer<typeof changelogEntrySchema>;
