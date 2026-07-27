import { beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(() => Promise.resolve({}));

mock.module('@/lib/api/http', () => ({
  http: {
    request: requestMock,
  },
}));

import {
  getGoalSnapshot,
  registerGoalEvidenceAttachment,
  sendGoalCommand,
  upsertGoalCapabilityRoute,
} from './goals.client';

describe('goals.client', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('reads the snapshot from the authenticated Goal resource route', async () => {
    await getGoalSnapshot('goal/a');

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/goals/goal%2Fa',
      }),
    );
  });

  it('wraps Goal commands in the endpoint request envelope', async () => {
    const command = {
      commandId: 'command_1',
      expectedRevision: 3,
      type: 'artifact.reconcile' as const,
      payload: {
        artifactId: 'artifact_1',
        headVersionId: 'version_2',
      },
    };

    await sendGoalCommand('goal_1', command);

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/goals/goal_1/commands',
        method: 'POST',
        body: { command },
      }),
    );
  });

  it('writes an exact stakeholder route through the Goal resource', async () => {
    const input = {
      capability: 'strategy',
      primaryUserId: '10000000-0000-4000-8000-000000000001',
      backupUserId: '10000000-0000-4000-8000-000000000002',
      escalationUserId: '10000000-0000-4000-8000-000000000003',
      scope: 'goal' as const,
    };

    await upsertGoalCapabilityRoute('goal/1', input);

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/goals/goal%2F1/capability-routes',
        method: 'PUT',
        body: expect.objectContaining(input),
      }),
    );
  });

  it('registers staged evidence without exposing a destination storage path', async () => {
    const input = {
      requestId: 'request_1',
      sourceStoragePath: '10000000-0000-4000-8000-000000000000/chat-attachments/upload/source.pdf',
      filename: 'source.pdf',
    };

    await registerGoalEvidenceAttachment('goal_1', input);

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/goals/goal_1/evidence-attachments',
        method: 'POST',
        body: input,
      }),
    );
  });
});
