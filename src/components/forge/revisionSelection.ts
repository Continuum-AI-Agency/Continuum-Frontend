import type { TemplateRevisionVariant } from '@continuum/contracts';

/** Source bytes can be reused by many revisions. Only a unique match is a legacy selection. */
export function selectTemplateRevision(
  variants: readonly TemplateRevisionVariant[],
  assetId: string,
  versionId: string | null,
  revisionId?: string,
) {
  const matches = variants.flatMap((variant) =>
    variant.revisions
      .filter((revision) =>
        revisionId
          ? revision.id === revisionId
          : (revision.sourceAssetId === assetId && revision.sourceVersionId === versionId) ||
            !!revision.sources?.some(
              (source) => source.assetId === assetId && source.versionId === versionId,
            ),
      )
      .map((revision) => ({ variant, revision })),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export const revisionIsReadOnly = (
  selection: NonNullable<ReturnType<typeof selectTemplateRevision>>,
) =>
  selection.variant.original ||
  !!selection.variant.archivedAt ||
  selection.revision.id !== selection.variant.draftHeadRevisionId;
