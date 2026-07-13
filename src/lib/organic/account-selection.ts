// Which account the planner publishes to, remembered per brand.
//
// Deliberately localStorage and not the persisted calendar store: this is a UI preference
// ("keep posting to this profile"), and it is validated against the brand's live account list
// before it is honored — a saved id for an account that has since been unlinked is ignored,
// never published to.

import type { PublishPlatform } from '@continuum/contracts';

const STORAGE_KEY = 'continuum:organic-planner:account-selection';

type Selection = Partial<Record<PublishPlatform, string>>;

function readAll(): Record<string, Selection> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Selection>) : {};
  } catch {
    return {};
  }
}

export function readSavedAccountSelection(brandId: string | null): Selection {
  if (!brandId) return {};
  return readAll()[brandId] ?? {};
}

export function saveAccountSelection(
  brandId: string | null,
  platform: PublishPlatform,
  accountId: string,
): void {
  if (!brandId || typeof window === 'undefined') return;
  try {
    const all = readAll();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...all, [brandId]: { ...(all[brandId] ?? {}), [platform]: accountId } }),
    );
  } catch {
    // A full or blocked localStorage must never break publishing — the in-memory selection
    // still governs this session.
  }
}
