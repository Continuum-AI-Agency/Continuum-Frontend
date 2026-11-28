import { describe, expect, it } from 'bun:test';
import {
  campaignArtifactDocumentSchema,
  campaignChecklistRegistry,
  watchmanDeliveryDataSchema,
} from '../index';

const execution = { goalId: 'goal', workNodeId: 'work', harnessRunId: 'harness' };
const at = '2026-11-26T00:00:00Z';
const data = {
  objective: 'Prepare a draft for review.',
  role: 'content',
  execution,
  delivery: { summary: 'The draft is ready for review.', proseStatus: 'unverified' },
  operationReceipts: [
    {
      operation_id: 'draft',
      execution,
      status: 'completed',
      verified_at: at,
      artifact_ids: ['saved-draft'],
    },
  ],
  evidenceIds: [],
  openItems: {
    limitations: ['Publishing has not been verified.'],
    followUps: ['Review the saved draft.'],
  },
};
describe('compact teammate delivery contract', () => {
  it('accepts routine draft delivery without campaign customer or competitor dossier sections', () => {
    expect(watchmanDeliveryDataSchema.safeParse(data).success).toBe(true);
    const document = campaignArtifactDocumentSchema.parse({
      schemaVersion: 1,
      contentSchemaVersion: 1,
      artifactType: 'watchman-delivery',
      goalId: 'goal',
      artifactId: 'artifact',
      templateId: 'watchman-assignment',
      templateVersion: 1,
      createdAt: at,
      updatedAt: at,
      data,
      provenance: [],
    });
    expect(document.artifactType).toBe('watchman-delivery');
    expect(campaignChecklistRegistry['watchman-delivery'].map((item) => item.path)).toEqual([
      '/data/objective',
      '/data/delivery',
      '/data/operationReceipts',
      '/data/openItems',
    ]);
  });
  it('requires completed execution-bound receipts and rejects queued or refused work', () => {
    for (const receipt of [
      { operation_id: 'draft', execution, status: 'queued', external_job_id: 'job' },
      { operation_id: 'draft', execution, status: 'running', external_job_id: 'job' },
      { operation_id: 'draft', execution, status: 'unknown', reason: 'Awaiting readback' },
      {
        operation_id: 'draft',
        execution,
        status: 'refused',
        code: 'blocked',
        reason: 'Approval required',
      },
      { operation_id: 'draft', status: 'completed', verified_at: at, artifact_ids: ['draft'] },
      { ...data.operationReceipts[0], execution: { ...execution, harnessRunId: 'old-harness' } },
    ])
      expect(
        watchmanDeliveryDataSchema.safeParse({ ...data, operationReceipts: [receipt] }).success,
      ).toBe(false);
  });
  it('keeps prose qualitative and unverified, with no extra numeric claim fields', () => {
    expect(
      watchmanDeliveryDataSchema.safeParse({
        ...data,
        delivery: { summary: 'Views increased by 50%.', proseStatus: 'unverified' },
      }).success,
    ).toBe(false);
    expect(
      watchmanDeliveryDataSchema.safeParse({
        ...data,
        delivery: { summary: 'Views doubled.', proseStatus: 'verified' },
      }).success,
    ).toBe(false);
    expect(
      watchmanDeliveryDataSchema.safeParse({ ...data, numericClaims: [{ value: 50 }] }).success,
    ).toBe(false);
  });
});
