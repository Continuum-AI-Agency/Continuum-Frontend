import { describe, expect, it } from 'bun:test';
import { canvasGraphChangeSetSchema } from './canvas-graph-change';

describe('canvas graph change set', () => {
  it('captures a revision-bound proposal without applying it', () => {
    const parsed = canvasGraphChangeSetSchema.parse({
      id: 'ab71d94a-b25b-4917-a28e-6780eb427355',
      runId: 'run-1',
      brandProfileId: '5b90a36d-445c-4138-90ce-64f2550dfd72',
      roomId: '43b352da-68c5-44c4-b0b9-9286230a1cae',
      baseRevision: 3,
      summary: 'Add an image generation step.',
      status: 'pending',
      operations: [{ kind: 'add_node', nodeId: 'image-1' }],
      affectedNodeIds: ['image-1'],
      affectedEdgeIds: [],
      proposedNodes: [{ id: 'image-1', type: 'nanoGen', position: { x: 0, y: 0 }, data: {} }],
      proposedEdges: [],
      createdAt: '2026-07-26T12:00:00.000Z',
    });

    expect(parsed.status).toBe('pending');
    expect(parsed.baseRevision).toBe(3);
  });

  it('accepts PostgreSQL timestamps with an explicit UTC offset', () => {
    const parsed = canvasGraphChangeSetSchema.safeParse({
      id: 'ab71d94a-b25b-4917-a28e-6780eb427355',
      runId: 'run-1',
      brandProfileId: '5b90a36d-445c-4138-90ce-64f2550dfd72',
      roomId: '43b352da-68c5-44c4-b0b9-9286230a1cae',
      baseRevision: 3,
      summary: 'Update the Video Editor.',
      status: 'accepted',
      operations: [{ kind: 'update_node', nodeId: 'editor-1' }],
      affectedNodeIds: ['editor-1'],
      affectedEdgeIds: [],
      proposedNodes: [
        { id: 'editor-1', type: 'timelineEditor', position: { x: 0, y: 0 }, data: {} },
      ],
      proposedEdges: [],
      createdAt: '2026-07-28T00:50:37.665+00:00',
      decidedAt: '2026-07-28T00:50:38.100+00:00',
    });

    expect(parsed.success).toBe(true);
  });
});
