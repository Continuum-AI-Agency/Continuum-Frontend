import { expect, test } from 'bun:test';
import {
  API_RENDER_SHARED_ROUTE,
  apiRenderBatchShareResponseSchema,
  apiRenderBatchShareRoute,
  apiRenderJobListQuerySchema,
  apiRenderJobSchema,
  apiRenderSharedZipPath,
} from './api-renders';

const BRAND = '11111111-1111-4111-8111-111111111111';
const BATCH = '33333333-3333-4333-8333-333333333333';

const job = {
  id: '22222222-2222-4222-8222-222222222222',
  brandId: BRAND,
  templateKey: '133',
  templateName: 'Hero',
  contractHash: 'hash',
  taskUid: null,
  status: 'finished',
  outputs: [],
  delivery: [],
  error: null,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

test('a job from before batches reads as having no batch and no known author', () => {
  const parsed = apiRenderJobSchema.parse(job);
  expect(parsed.batchId).toBeNull();
  expect(parsed.createdByEmail).toBeNull();
});

test('a job carries its batch and author', () => {
  const parsed = apiRenderJobSchema.parse({
    ...job,
    batchId: BATCH,
    createdByEmail: 'michelle@example.com',
  });
  expect(parsed.batchId).toBe(BATCH);
  expect(parsed.createdByEmail).toBe('michelle@example.com');
  expect(apiRenderJobSchema.safeParse({ ...job, batchId: 'not-a-uuid' }).success).toBe(false);
});

test('the jobs list can ask for one batch', () => {
  expect(apiRenderJobListQuerySchema.parse({ brandId: BRAND, batchId: BATCH }).batchId).toBe(BATCH);
  expect(apiRenderJobListQuerySchema.safeParse({ brandId: BRAND, batchId: 'x' }).success).toBe(
    false,
  );
});

test('share routes', () => {
  expect(apiRenderBatchShareRoute(BATCH)).toBe(`/api/ai-studio/renders/batches/${BATCH}/share`);
  expect(apiRenderSharedZipPath('abc.def', 'hero promo #1.zip')).toBe(
    `${API_RENDER_SHARED_ROUTE}/hero%20promo%20%231.zip?token=abc.def`,
  );
});

test('a share response must point at the shared route', () => {
  const expiresAt = '2026-10-19T00:00:00.000Z';
  expect(
    apiRenderBatchShareResponseSchema.safeParse({
      path: apiRenderSharedZipPath('t', 'a.zip'),
      expiresAt,
    }).success,
  ).toBe(true);
  expect(
    apiRenderBatchShareResponseSchema.safeParse({ path: '/api/elsewhere/a.zip', expiresAt })
      .success,
  ).toBe(false);
});
