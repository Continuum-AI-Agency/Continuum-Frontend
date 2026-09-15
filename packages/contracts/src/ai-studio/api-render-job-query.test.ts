import { expect, test } from 'bun:test';
import { apiRenderJobListQuerySchema } from './api-renders';

test('render history can request one finished render for one saved row', () => {
  expect(
    apiRenderJobListQuerySchema.parse({
      brandId: '11111111-1111-4111-8111-111111111111',
      renderSetRowId: '22222222-2222-4222-8222-222222222222',
      status: 'finished',
      limit: '1',
    }),
  ).toMatchObject({
    renderSetRowId: '22222222-2222-4222-8222-222222222222',
    status: 'finished',
    limit: 1,
  });
});
