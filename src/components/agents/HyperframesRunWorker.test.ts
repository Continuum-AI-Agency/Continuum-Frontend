import { describe, expect, test } from 'bun:test';
import type { AgentRunEventDto } from '@continuum/contracts';
import { resolvePendingHyperframesWork } from './HyperframesRunWorker';

const event = (seq: number, type: string, data: Record<string, unknown>): AgentRunEventDto => ({
  eventId: `event-${seq}`,
  seq,
  ts: new Date(seq).toISOString(),
  type,
  data,
});

const fingerprint = 'a'.repeat(64);

describe('HyperFrames background work projection', () => {
  test('selects an unhandled visual-review request', () => {
    expect(
      resolvePendingHyperframesWork([
        event(0, 'hyperframes.visual_review.requested', {
          revisionId: 'revision-1',
          fingerprint,
          timestampsSeconds: [0, 1, 2, 3, 4],
          pass: 0,
        }),
      ]),
    ).toEqual({
      kind: 'review',
      key: 'review:revision-1:0',
      revisionId: 'revision-1',
      fingerprint,
      timestampsSeconds: [0, 1, 2, 3, 4],
    });
  });

  test('does not repeat a completed review and advances to render', () => {
    expect(
      resolvePendingHyperframesWork([
        event(0, 'hyperframes.visual_review.requested', {
          revisionId: 'revision-1',
          fingerprint,
          timestampsSeconds: [0, 1, 2, 3, 4],
          pass: 0,
        }),
        event(1, 'hyperframes.visual_review.completed', {
          revisionId: 'revision-1',
          accepted: true,
          warnings: [],
          pass: 0,
        }),
        event(2, 'hyperframes.render.requested', {
          revisionId: 'revision-1',
          revisionNumber: 1,
          fingerprint,
          compositionStorage: { bucket: 'hyperframes-compositions', path: 'r.html' },
        }),
      ]),
    ).toMatchObject({ kind: 'render', revisionId: 'revision-1', fingerprint });
  });

  test('advances from a completed repair review to the next revision and pass', () => {
    expect(
      resolvePendingHyperframesWork([
        event(0, 'hyperframes.visual_review.requested', {
          revisionId: 'revision-1',
          fingerprint,
          timestampsSeconds: [0, 1, 2, 3, 4],
          pass: 0,
        }),
        event(1, 'hyperframes.visual_review.completed', {
          revisionId: 'revision-1',
          accepted: false,
          warnings: ['Repairing a clipped title.'],
          pass: 0,
        }),
        event(2, 'hyperframes.visual_review.requested', {
          revisionId: 'revision-2',
          fingerprint,
          timestampsSeconds: [0, 1, 2, 3, 4],
          pass: 1,
        }),
      ]),
    ).toEqual({
      kind: 'review',
      key: 'review:revision-2:1',
      revisionId: 'revision-2',
      fingerprint,
      timestampsSeconds: [0, 1, 2, 3, 4],
    });
  });

  test('returns no work once the render completed', () => {
    expect(
      resolvePendingHyperframesWork([
        event(0, 'hyperframes.render.requested', {
          revisionId: 'revision-1',
          revisionNumber: 1,
          fingerprint,
          compositionStorage: { bucket: 'hyperframes-compositions', path: 'r.html' },
        }),
        event(1, 'hyperframes.render.completed', {
          revisionId: 'revision-1',
          assetId: 'asset-1',
          storage: { bucket: 'media-library', path: 'render.mp4' },
        }),
      ]),
    ).toBeNull();
  });
});
