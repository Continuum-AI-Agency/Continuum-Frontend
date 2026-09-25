import { describe, expect, test } from 'bun:test';
import { type ApiRenderJob, apiRenderJobSchema } from '@continuum/contracts';
import { batchStatus, groupJobsIntoBatches } from './renderBatches';

const BATCH_A = '00000000-0000-4000-8000-00000000000a';
const BATCH_B = '00000000-0000-4000-8000-00000000000b';
let sequence = 0;

const job = (overrides: Partial<ApiRenderJob>): ApiRenderJob =>
  apiRenderJobSchema.parse({
    id: `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    brandId: '00000000-0000-4000-8000-000000000001',
    templateKey: '133',
    templateName: 'Hero',
    contractHash: 'hash',
    taskUid: null,
    status: 'finished',
    outputs: [],
    delivery: [],
    error: null,
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T10:00:00.000Z',
    ...overrides,
  });

const file = (name: string) => ({
  id: name,
  kind: 'image' as const,
  fileName: name,
  mimeType: 'image/jpeg',
  url: `https://bucket.test/${name}`,
  width: null,
  height: null,
  assetId: null,
  versionId: null,
});

describe('groupJobsIntoBatches', () => {
  test('one batch per Render click, newest batch first, jobs kept in list order', () => {
    const a1 = job({ batchId: BATCH_A, createdAt: '2026-09-19T10:00:01.000Z' });
    const a2 = job({ batchId: BATCH_A, createdAt: '2026-09-19T10:00:00.000Z' });
    const b1 = job({ batchId: BATCH_B, createdAt: '2026-09-19T12:00:00.000Z' });
    const batches = groupJobsIntoBatches([a1, b1, a2]);
    expect(batches.map((batch) => batch.id)).toEqual([BATCH_B, BATCH_A]);
    expect(batches[1]?.jobs.map((item) => item.id)).toEqual([a1.id, a2.id]);
    // Fired when its first job was created, not when its last one was.
    expect(batches[1]?.createdAt).toBe('2026-09-19T10:00:00.000Z');
  });

  test('a job with no batch id is a batch of its own', () => {
    const lone = job({ batchId: null });
    expect(groupJobsIntoBatches([lone]).map((batch) => [batch.id, batch.jobs.length])).toEqual([
      [lone.id, 1],
    ]);
  });

  test('counts statuses and the files a zip would hold; the author is whoever is known', () => {
    const [batch] = groupJobsIntoBatches([
      job({ batchId: BATCH_A, outputs: [file('a.jpg'), file('b.jpg')] }),
      job({ batchId: BATCH_A, status: 'rendering', createdByEmail: 'michelle@example.com' }),
      job({ batchId: BATCH_A, status: 'queued' }),
      job({ batchId: BATCH_A, status: 'failed', outputs: [file('partial.jpg')] }),
    ]);
    expect(batch).toMatchObject({
      finished: 1,
      inFlight: 2,
      failed: 1,
      files: 2,
      createdByEmail: 'michelle@example.com',
    });
  });

  test('the preview is the first render with a file', () => {
    const empty = job({ batchId: BATCH_A, status: 'rendering' });
    const withFile = job({ batchId: BATCH_A, outputs: [file('a.jpg')] });
    expect(groupJobsIntoBatches([empty, withFile])[0]?.preview.id).toBe(withFile.id);
    expect(groupJobsIntoBatches([empty])[0]?.preview.id).toBe(empty.id);
  });
});

describe('batchStatus', () => {
  const statusOf = (...statuses: ApiRenderJob['status'][]) => {
    const [batch] = groupJobsIntoBatches(
      statuses.map((status) => job({ batchId: BATCH_A, status })),
    );
    if (!batch) throw new Error('no batch');
    return batchStatus(batch);
  };

  test('reads what is still happening first, then what went wrong', () => {
    expect(statusOf('finished', 'rendering', 'queued')).toEqual({
      label: '2 of 3 rendering · 33%',
      tone: 'warning',
      busy: true,
    });
    expect(statusOf('finished', 'failed')).toEqual({
      label: '1 of 2 failed',
      tone: 'destructive',
      busy: false,
    });
    expect(statusOf('failed', 'failed')).toEqual({
      label: 'failed',
      tone: 'destructive',
      busy: false,
    });
    expect(statusOf('finished', 'finished')).toEqual({
      label: 'finished',
      tone: 'success',
      busy: false,
    });
  });

  test('uses the worker percentage once a render reports it', () => {
    const [batch] = groupJobsIntoBatches([
      job({ batchId: BATCH_A, status: 'rendering', progressPct: 40 }),
      job({ batchId: BATCH_A, status: 'queued', progressPct: null }),
    ]);
    expect(batchStatus(batch!)).toEqual({
      label: '2 of 2 rendering · 20%',
      tone: 'warning',
      busy: true,
    });
  });
});
