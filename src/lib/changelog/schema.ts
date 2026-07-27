// The in-app "What's New" changelog entry schema now lives in the shared
// contracts package, so the write path (`bun run whats-new:add`) and this
// Frontend reader validate against one definition. Kept here as a thin re-export
// under the historical names so existing changelog imports stay stable.

export {
  WHATS_NEW_TAGS as CHANGELOG_TAGS,
  type WhatsNewEntry as ChangelogEntry,
  whatsNewChangelogSchema as changelogSchema,
  whatsNewEntrySchema as changelogEntrySchema,
} from '@continuum/contracts';
