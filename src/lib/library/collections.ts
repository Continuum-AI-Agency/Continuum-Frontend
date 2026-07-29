// The brand's Library collections, read from the same endpoint the Library page
// uses. Collections are FLAT — `media.collections` has no parent/child edge, so
// every consumer renders a single list, never a tree.
//
// This throws on a failed read rather than returning an empty list: a caller
// that wants to fail open (the agent's @-mention menu) says so with `.catch`,
// while a caller that must distinguish "no collections" from "could not load"
// (the automation picker, which degrades to a raw id field) can see the error.

import type { MediaCollection } from '@continuum/contracts';

export async function fetchLibraryCollections(brandId: string): Promise<MediaCollection[]> {
  const response = await fetch(`/api/library/collections?brandId=${encodeURIComponent(brandId)}`);
  if (!response.ok) {
    throw new Error(`Unable to load Library collections (${response.status})`);
  }
  const payload = (await response.json()) as { collections?: MediaCollection[] };
  return payload.collections ?? [];
}
