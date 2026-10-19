// The organic platforms, their order and their labels are the contracts' (`PUBLISH_PLATFORM_ORDER`,
// `PUBLISH_PLATFORM_LABELS`). This file only keeps the old names alive for the surfaces outside the
// planner that still import them; new code imports from `@continuum/contracts` directly.
import {
  PUBLISH_PLATFORM_LABELS,
  type PublishPlatform,
  publishPlatformSchema,
} from '@continuum/contracts';

export const ORGANIC_PLATFORM_KEYS = publishPlatformSchema.options;

export type OrganicPlatformKey = PublishPlatform;

export function isOrganicPlatformKey(key: string): key is OrganicPlatformKey {
  return (ORGANIC_PLATFORM_KEYS as readonly string[]).includes(key);
}

// Falls back to the key so an unmapped platform degrades to something readable rather than blank.
export function organicPlatformLabel(key: string): string {
  return isOrganicPlatformKey(key) ? PUBLISH_PLATFORM_LABELS[key] : key;
}
