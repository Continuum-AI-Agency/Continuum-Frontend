import { describe, expect, it } from 'bun:test';
import {
  type GoalArtifact,
  type GoalArtifactDocument,
  type GoalCommandInput,
  parseGoalArtifactMarkdown,
  serializeGoalArtifactMarkdown,
} from '@continuum/contracts';
import { saveGoalArtifactMarkdown } from './saveGoalArtifactMarkdown';

const updatedAt = '2026-07-26T15:00:00.000Z';

function artifact(): GoalArtifact {
  return {
    id: 'artifact_strategy',
    goalId: 'goal_campaign',
    artifactType: 'campaign_strategy',
    title: 'Campaign strategy',
    format: 'markdown',
    requirement: 'core',
    status: 'drafting',
    libraryAssetId: 'asset_strategy',
    requiredSectionIds: [],
    completedSectionIds: [],
    dependencyIds: [],
    evidenceIds: [],
    resourceIds: [],
    contributors: [],
    reviewers: [],
    createdBy: { kind: 'agent', agent: 'jaina' },
    createdAt: '2026-07-26T12:00:00.000Z',
    updatedAt: '2026-07-26T12:00:00.000Z',
  };
}

function document(): GoalArtifactDocument {
  return {
    artifactId: 'artifact_strategy',
    libraryAssetId: 'asset_strategy',
    versionId: 'version_1',
    content: serializeGoalArtifactMarkdown({
      frontMatter: {
        schema_version: 1,
        goal_id: 'goal_campaign',
        artifact_id: 'artifact_strategy',
        artifact_type: 'campaign_strategy',
        status: 'drafting',
        version: 1,
        dependencies: [],
        evidence_ids: [],
        updated_at: '2026-07-26T12:00:00.000Z',
        updated_by: { kind: 'agent', agent: 'jaina' },
      },
      body: '# Original',
    }),
    editable: true,
  };
}

describe('saveGoalArtifactMarkdown', () => {
  it('creates a Library version before reconciling its exact id into the Goal', async () => {
    let uploadedFile: File | null = null;
    let sentCommand: GoalCommandInput | null = null;

    const result = await saveGoalArtifactMarkdown(
      {
        brandId: 'brand_1',
        goalId: 'goal_campaign',
        userId: 'user_1',
        expectedRevision: 7,
        artifact: artifact(),
        document: document(),
        markdown: '# Revised\n\nEvidence-backed direction.',
      },
      {
        now: () => updatedAt,
        commandId: () => 'command_save_1',
        uploadVersion: async (input) => {
          uploadedFile = input.file;
          expect(input.brandId).toBe('brand_1');
          expect(input.assetId).toBe('asset_strategy');
          return {
            assetId: 'asset_strategy',
            versionNumber: 2,
            versionId: 'version_2',
            versions: [],
          };
        },
        sendCommand: async (_goalId, command) => {
          sentCommand = command;
          return {
            accepted: true,
            commandId: command.commandId,
            eventIds: ['event_1'],
            revision: 8,
            lastSeq: 12,
          };
        },
      },
    );

    expect(result).toEqual({ versionId: 'version_2' });
    expect(uploadedFile).not.toBeNull();
    const parsed = parseGoalArtifactMarkdown(await (uploadedFile as File).text());
    expect(parsed.body).toBe('# Revised\n\nEvidence-backed direction.');
    expect(parsed.frontMatter).toMatchObject({
      version: 2,
      updated_at: updatedAt,
      updated_by: { kind: 'human', userId: 'user_1' },
    });
    expect(sentCommand).toEqual({
      commandId: 'command_save_1',
      expectedRevision: 7,
      type: 'artifact.reconcile',
      payload: {
        artifactId: 'artifact_strategy',
        headVersionId: 'version_2',
      },
    });
  });

  it('refuses to overwrite Markdown that has lost its Goal identity', async () => {
    let uploadCount = 0;
    const invalidDocument = { ...document(), content: '# Unscoped document' };

    await expect(
      saveGoalArtifactMarkdown(
        {
          brandId: 'brand_1',
          goalId: 'goal_campaign',
          userId: 'user_1',
          expectedRevision: 7,
          artifact: artifact(),
          document: invalidDocument,
          markdown: '# Revised',
        },
        {
          uploadVersion: async () => {
            uploadCount += 1;
            return {
              assetId: 'asset_strategy',
              versionNumber: 2,
              versionId: 'version_2',
              versions: [],
            };
          },
        },
      ),
    ).rejects.toThrow('missing valid Goal front matter');
    expect(uploadCount).toBe(0);
  });
});
