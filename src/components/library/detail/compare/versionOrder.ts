// The stack order the reorder operation expects: EVERY version id, oldest first,
// the last one becoming the head. "Up" moves a version toward the head.
export function reorderedVersionIds(
  versions: readonly { id: string; versionNumber: number }[],
  versionId: string,
  direction: 'up' | 'down',
): string[] | null {
  const oldestFirst = [...versions]
    .sort((left, right) => left.versionNumber - right.versionNumber)
    .map((version) => version.id);
  const index = oldestFirst.indexOf(versionId);
  const swapWith = direction === 'up' ? index + 1 : index - 1;
  if (index < 0 || swapWith < 0 || swapWith >= oldestFirst.length) return null;
  [oldestFirst[index], oldestFirst[swapWith]] = [oldestFirst[swapWith], oldestFirst[index]];
  return oldestFirst;
}
