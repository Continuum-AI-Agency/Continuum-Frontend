/**
 * Collections nest like Air sub-boards, bounded so a tree cannot become a DAM.
 * Root depth is 0. "5 sub-boards deep" means a collection at depth 5 is a leaf.
 */
export const LIBRARY_COLLECTION_MAX_DEPTH = 5;

export function nextCollectionDepth(parentDepth: number | null | undefined): number {
  if (parentDepth == null) return 0;
  if (!Number.isInteger(parentDepth) || parentDepth < 0) {
    throw new Error('parentDepth must be a non-negative integer');
  }
  return parentDepth + 1;
}

export function canNestCollection(parentDepth: number | null | undefined): boolean {
  return nextCollectionDepth(parentDepth) <= LIBRARY_COLLECTION_MAX_DEPTH;
}

/** Depth-first, name-sorted tree. Orphans whose parent is missing sit at the root. */
export function orderCollectionsTree<
  T extends { id: string; parentId?: string | null; name: string },
>(collections: readonly T[]): T[] {
  const ids = new Set(collections.map((collection) => collection.id));
  const byParent = new Map<string, T[]>();
  for (const collection of collections) {
    const parent =
      collection.parentId && ids.has(collection.parentId) ? collection.parentId : '__root';
    const siblings = byParent.get(parent) ?? [];
    siblings.push(collection);
    byParent.set(parent, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name));
  }
  const ordered: T[] = [];
  const walk = (parent: string) => {
    for (const child of byParent.get(parent) ?? []) {
      ordered.push(child);
      walk(child.id);
    }
  };
  walk('__root');
  return ordered;
}
