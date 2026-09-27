import type { MediaCollection } from '@continuum/contracts';

/**
 * Root-first ancestry of a collection, ending with the collection itself. Walks
 * `parentId`; stops at a missing parent or a cycle (SQL forbids cycles, but a stale
 * client list must never hang the header).
 */
export function collectionTrail(
  collections: readonly Pick<MediaCollection, 'id' | 'name' | 'parentId'>[],
  collectionId: string,
): Pick<MediaCollection, 'id' | 'name'>[] {
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const trail: Pick<MediaCollection, 'id' | 'name'>[] = [];
  const seen = new Set<string>();
  let current = byId.get(collectionId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    trail.unshift({ id: current.id, name: current.name });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return trail;
}
