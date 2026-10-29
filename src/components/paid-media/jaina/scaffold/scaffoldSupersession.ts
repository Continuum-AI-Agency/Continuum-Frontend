import type { JainaScaffoldState } from '@/lib/jaina/scaffoldTypes';

/**
 * Which scaffold versions in a thread a newer one replaced, and the version that did.
 *
 * A correction in words ("quita el retargeting") saves a NEW version under the same parent
 * scaffold and draws a new card below the old one. Both stay in the transcript, and the old
 * card must not read as something still to approve: the Backend refuses to deploy a version
 * that is no longer current, so its button could only fail. Keyed by version id; a version
 * the thread cannot place (no parent, no number — a card seeded from a gate) supersedes
 * nothing and is superseded by nothing here.
 */
export const supersedingVersionsOf = (
  scaffolds: ReadonlyArray<Pick<JainaScaffoldState, 'scaffoldId' | 'parentScaffoldId' | 'version'>>,
): Map<string, number> => {
  const newestByParent = new Map<string, number>();
  for (const { parentScaffoldId, version } of scaffolds) {
    if (!parentScaffoldId || typeof version !== 'number') continue;
    newestByParent.set(
      parentScaffoldId,
      Math.max(version, newestByParent.get(parentScaffoldId) ?? 0),
    );
  }
  const superseded = new Map<string, number>();
  for (const { scaffoldId, parentScaffoldId, version } of scaffolds) {
    if (!parentScaffoldId || typeof version !== 'number') continue;
    const newest = newestByParent.get(parentScaffoldId) ?? version;
    if (newest > version) superseded.set(scaffoldId, newest);
  }
  return superseded;
};
