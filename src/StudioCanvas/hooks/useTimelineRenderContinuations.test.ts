import { describe, expect, it, mock } from 'bun:test';
import type {
  CanvasRenderContinuationClaimRequest,
  CanvasRenderContinuationFinishRequest,
} from '@continuum/contracts';
import { resumeTimelineRenderContinuation } from './useTimelineRenderContinuations';

const request: CanvasRenderContinuationClaimRequest = {
  jobId: 'f5f608a9-cbac-49d2-9572-72b0c6f4f80e',
  brandProfileId: 'f8cf8a04-2920-4ce8-a60b-36675ef9f379',
  roomId: '999dad2e-64a0-4eb3-aefb-c10afdcc93df',
  nodeId: 'timeline-1',
};

describe('resumeTimelineRenderContinuation', () => {
  it('claims once, executes downstream leaves in order, and marks the handoff done', async () => {
    const executed: string[] = [];
    const finish = mock(async (_body: CanvasRenderContinuationFinishRequest) => ({
      updated: true,
    }));

    await expect(
      resumeTimelineRenderContinuation(request, {
        claim: async () => ({ claimed: true, downstreamLeafIds: ['leaf-a', 'leaf-b'] }),
        executeTarget: async (nodeId) => {
          executed.push(nodeId);
        },
        finish,
      }),
    ).resolves.toBe(true);

    expect(executed).toEqual(['leaf-a', 'leaf-b']);
    expect(finish).toHaveBeenCalledWith({ ...request, status: 'done' });
  });

  it('records a claimed downstream failure before surfacing it', async () => {
    const finish = mock(async (_body: CanvasRenderContinuationFinishRequest) => ({
      updated: true,
    }));

    await expect(
      resumeTimelineRenderContinuation(request, {
        claim: async () => ({ claimed: true, downstreamLeafIds: ['leaf-a'] }),
        executeTarget: async () => {
          throw new Error('generation failed');
        },
        finish,
      }),
    ).rejects.toThrow('generation failed');

    expect(finish).toHaveBeenCalledWith({
      ...request,
      status: 'error',
      error: 'generation failed',
    });
  });

  it('does nothing when another client already claimed the continuation', async () => {
    const executeTarget = mock(async (_nodeId: string) => undefined);
    const finish = mock(async (_body: CanvasRenderContinuationFinishRequest) => ({
      updated: true,
    }));

    await expect(
      resumeTimelineRenderContinuation(request, {
        claim: async () => ({ claimed: false, downstreamLeafIds: [] }),
        executeTarget,
        finish,
      }),
    ).resolves.toBe(false);

    expect(executeTarget).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });
});
