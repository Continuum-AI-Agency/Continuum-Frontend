import { isPlayableSidecarPreview } from '@continuum/contracts';

export type SidecarUploadPair = {
  source: File;
  companion: File;
};

export function partitionSidecarUploads(files: readonly File[]): {
  pairs: SidecarUploadPair[];
  rest: File[];
} {
  const remaining = [...files];
  const pairs: SidecarUploadPair[] = [];
  const used = new Set<File>();

  for (const source of remaining) {
    if (used.has(source)) continue;
    const companion = remaining.find(
      (candidate) =>
        candidate !== source &&
        !used.has(candidate) &&
        isPlayableSidecarPreview({
          sourceFileName: source.name,
          companionFileName: candidate.name,
        }),
    );
    if (!companion) continue;
    pairs.push({ source, companion });
    used.add(source);
    used.add(companion);
  }

  return {
    pairs,
    rest: remaining.filter((file) => !used.has(file)),
  };
}
