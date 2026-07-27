import {
  type GoalArtifact,
  type GoalArtifactDocument,
  parseGoalArtifactMarkdown,
  serializeGoalArtifactMarkdown,
} from '@continuum/contracts';
import { sendGoalCommand } from '@/lib/api/goals.client';
import { uploadNewAssetVersion } from '@/lib/library/versions';

type UploadVersion = (
  input: Parameters<typeof uploadNewAssetVersion>[0],
) => ReturnType<typeof uploadNewAssetVersion>;

export type SaveGoalArtifactMarkdownInput = {
  brandId: string;
  goalId: string;
  userId: string;
  expectedRevision: number;
  artifact: GoalArtifact;
  document: GoalArtifactDocument;
  markdown: string;
};

export type SaveGoalArtifactMarkdownDependencies = {
  uploadVersion?: UploadVersion;
  sendCommand?: typeof sendGoalCommand;
  now?: () => string;
  commandId?: () => string;
};

function markdownFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'goal-artifact'}.md`;
}

export async function saveGoalArtifactMarkdown(
  input: SaveGoalArtifactMarkdownInput,
  dependencies: SaveGoalArtifactMarkdownDependencies = {},
): Promise<{ versionId: string }> {
  if (input.artifact.format !== 'markdown') {
    throw new Error('Only Markdown Goal artifacts can be edited here.');
  }
  if (!input.document.editable) {
    throw new Error('This Library version is read-only.');
  }
  if (!input.document.content) {
    throw new Error('The current Library version has no Markdown content to revise.');
  }
  if (
    input.document.artifactId !== input.artifact.id ||
    input.document.libraryAssetId !== input.artifact.libraryAssetId
  ) {
    throw new Error('The Goal artifact no longer matches its Library document.');
  }

  const parsed = parseGoalArtifactMarkdown(input.document.content);
  if (!parsed.frontMatter) {
    throw new Error('This artifact is missing valid Goal front matter and cannot be safely saved.');
  }
  if (
    parsed.frontMatter.goal_id !== input.goalId ||
    parsed.frontMatter.artifact_id !== input.artifact.id
  ) {
    throw new Error('The Markdown front matter belongs to a different Goal artifact.');
  }

  const content = serializeGoalArtifactMarkdown({
    frontMatter: {
      ...parsed.frontMatter,
      status: input.artifact.status,
      version: parsed.frontMatter.version + 1,
      updated_at: (dependencies.now ?? (() => new Date().toISOString()))(),
      updated_by: { kind: 'human', userId: input.userId },
    },
    body: input.markdown,
  });
  const file = new File([content], markdownFileName(input.artifact.title), {
    type: 'text/markdown',
  });

  const registered = await (dependencies.uploadVersion ?? uploadNewAssetVersion)({
    brandId: input.brandId,
    assetId: input.artifact.libraryAssetId,
    baseVersionId: input.document.versionId,
    file,
    note: `Goal draft: ${input.artifact.title}`,
  });
  if (!registered.versionId) {
    throw new Error('Library saved the bytes but did not return an exact version identifier.');
  }

  await (dependencies.sendCommand ?? sendGoalCommand)(input.goalId, {
    commandId: (dependencies.commandId ?? (() => crypto.randomUUID()))(),
    expectedRevision: input.expectedRevision,
    type: 'artifact.reconcile',
    payload: {
      artifactId: input.artifact.id,
      headVersionId: registered.versionId,
    },
  });

  return { versionId: registered.versionId };
}
