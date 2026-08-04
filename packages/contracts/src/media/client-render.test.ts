import { describe, expect, it } from 'bun:test';
import { createEditorProjectV2 } from '../ai-studio/editor-project-reducer';
import {
  claimClientRenderJobRequestSchema,
  clientRenderExecutionSpecSchema,
  clientRenderJobSchema,
} from './client-render';

describe('client render contracts', () => {
  it('accepts captioned UGC metadata on a Planner reel render', () => {
    expect(
      clientRenderExecutionSpecSchema.safeParse({
        kind: 'planner_reel',
        draftId: '00000000-0000-4000-8000-000000000001',
        durationSeconds: 20,
        captions: { enabled: true, source: 'google_stt_v2' },
        ugc: {
          referenceAssetIds: ['00000000-0000-4000-8000-000000000002'],
          characterAssetIds: ['00000000-0000-4000-8000-000000000002'],
        },
        origin: { label: 'Planner reel', viewHref: '/organic' },
      }).success,
    ).toBe(true);
  });

  it('keeps each render surface behind one discriminated execution contract', () => {
    expect(
      clientRenderExecutionSpecSchema.parse({
        kind: 'hyperframes_agent',
        runId: 'b22af72c-0af6-462c-a794-d4b0a9c441ca',
        canvasId: 'canvas-1',
        nodeId: 'node-1',
        origin: { label: 'HyperFrames Agent', viewHref: '/ai-studio?roomId=canvas-1' },
      }).kind,
    ).toBe('hyperframes_agent');

    expect(
      clientRenderExecutionSpecSchema.parse({
        kind: 'mcp_clip_batch',
        sourceAssetId: 'a58c22fb-d5de-4781-b282-455397e758a0',
        origin: { label: 'UGC clip batch', viewHref: '/library' },
      }).kind,
    ).toBe('mcp_clip_batch');
  });

  it('pins the exact editor project revision into a timeline render job', () => {
    const project = createEditorProjectV2({
      projectId: '00000000-0000-4000-8000-000000000111',
      title: 'Launch film',
      width: 1080,
      height: 1920,
      now: '2026-08-01T12:00:00.000Z',
    });
    expect(
      clientRenderExecutionSpecSchema.parse({
        kind: 'timeline_editor',
        projectId: project.projectId,
        projectRevision: project.revision,
        projectFingerprint: project.fingerprint,
        project,
        origin: { label: project.title, viewHref: '/ai-studio?videoProjectId=project' },
      }).kind,
    ).toBe('timeline_editor');
    expect(() =>
      clientRenderExecutionSpecSchema.parse({
        kind: 'timeline_editor',
        projectId: project.projectId,
        projectRevision: project.revision + 1,
        projectFingerprint: project.fingerprint,
        project,
        origin: { label: project.title, viewHref: '/ai-studio?videoProjectId=project' },
      }),
    ).toThrow();
  });

  it('requires a per-device identity and a capability probe at claim time', () => {
    expect(() =>
      claimClientRenderJobRequestSchema.parse({
        clientId: 'device-123',
        capabilities: { avc: true, aac: true },
      }),
    ).toThrow();
  });

  it('accepts PostgreSQL UUIDs used by legacy local fixtures', () => {
    const job = clientRenderJobSchema.parse({
      id: '7ab9c81f-49c9-4546-8845-a0c739c36963',
      brandId: '00000000-0000-4000-8000-0000000000b2',
      kind: 'hyperframes_agent',
      sourceId: 'run',
      sourceRevision: '1',
      title: 'HyperFrames render',
      createdBy: '00000000-0000-0000-0000-0000000000a1',
      state: 'ready',
      progress: 0,
      phase: null,
      inputs: [
        {
          position: 0,
          kind: 'composition',
          sourceId: 'revision-1',
          label: 'Revision 1',
          sourceRevision: 'sha256:abc',
          storage: { bucket: 'hyperframes-compositions', path: 'brand/revision-1.html' },
        },
      ],
      executionSpec: {
        kind: 'hyperframes_agent',
        runId: '7ab9c81f-49c9-4546-8845-a0c739c36963',
        canvasId: 'canvas-1',
        nodeId: 'node-1',
        origin: { label: 'HyperFrames Agent', viewHref: '/ai-studio?roomId=canvas-1' },
      },
      claimedBy: null,
      claimedClientId: null,
      leaseToken: null,
      leaseExpiresAt: null,
      attemptCount: 0,
      resultAssetIds: [],
      resultAssetRefs: [],
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    });

    expect(job.createdBy).toBe('00000000-0000-0000-0000-0000000000a1');
  });

  it('rejects mismatched job kind and execution spec', () => {
    expect(() =>
      clientRenderJobSchema.parse({
        id: '7ab9c81f-49c9-4546-8845-a0c739c36963',
        brandId: '6b23a115-e47f-494b-8810-30dc3ad183eb',
        kind: 'planner_reel',
        sourceId: 'draft',
        sourceRevision: '1',
        title: 'Planner reel',
        createdBy: null,
        state: 'ready',
        progress: 0,
        phase: null,
        inputs: [
          {
            position: 0,
            kind: 'video',
            sourceId: 'brand:scene-1.mp4',
            label: 'Scene 1',
          },
        ],
        executionSpec: {
          kind: 'mcp_clip_batch',
          sourceAssetId: 'a58c22fb-d5de-4781-b282-455397e758a0',
          origin: { label: 'Clips', viewHref: '/library' },
        },
        claimedBy: null,
        claimedClientId: null,
        leaseToken: null,
        leaseExpiresAt: null,
        attemptCount: 0,
        resultAssetIds: [],
        resultAssetRefs: [],
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      }),
    ).toThrow();
  });

  it('returns immutable Library references for completed render results', () => {
    const result = clientRenderJobSchema.safeParse({
      id: '7ab9c81f-49c9-4546-8845-a0c739c36963',
      brandId: '6b23a115-e47f-494b-8810-30dc3ad183eb',
      kind: 'mcp_clip_batch',
      sourceId: 'source',
      sourceRevision: '1',
      title: 'Clip batch',
      createdBy: null,
      state: 'completed',
      progress: 1,
      phase: 'Complete',
      inputs: [
        {
          position: 0,
          kind: 'source_asset',
          sourceId: 'a58c22fb-d5de-4781-b282-455397e758a0',
          label: 'Source',
          sourceAssetId: 'a58c22fb-d5de-4781-b282-455397e758a0',
        },
      ],
      executionSpec: {
        kind: 'mcp_clip_batch',
        sourceAssetId: 'a58c22fb-d5de-4781-b282-455397e758a0',
        origin: { label: 'Clips', viewHref: '/library' },
      },
      claimedBy: null,
      claimedClientId: null,
      leaseToken: null,
      leaseExpiresAt: null,
      attemptCount: 1,
      resultAssetIds: ['11111111-1111-4111-8111-111111111111'],
      resultAssetRefs: [
        {
          asset_id: '11111111-1111-4111-8111-111111111111',
          version_id: '22222222-2222-4222-8222-222222222222',
        },
      ],
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
