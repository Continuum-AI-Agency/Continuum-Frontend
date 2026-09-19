import { afterEach, expect, test } from 'bun:test';
import { apiRenderJobSchema } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { DeliveryChain } from '@/components/forge/DeliveryChain';

afterEach(cleanup);

const file = (fileName: string, assetId: string | null) => ({
  id: fileName,
  kind: 'video',
  fileName,
  mimeType: 'video/mp4',
  url: `https://bucket.example.test/${fileName}`,
  width: null,
  height: null,
  assetId,
  versionId: assetId,
});

const job = (outputs: ReturnType<typeof file>[]) =>
  apiRenderJobSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    brandId: '22222222-2222-4222-8222-222222222222',
    templateKey: '67',
    templateName: 'Card',
    contractHash: 'hash',
    taskUid: 'T-1',
    status: 'finished',
    outputs,
    delivery: [],
    error: null,
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
  });

test('masters alone read as the render bucket, never as a Library copy still to come', () => {
  render(<DeliveryChain job={job([file('Card.mxf', null), file('Card.mov', null)])} />);
  expect(screen.getByText('Render bucket')).toBeTruthy();
  expect(screen.queryByText('Library')).toBeNull();
});

test('beside a master, the saved MP4 is what the Library tick reads', () => {
  const asset = '33333333-3333-4333-8333-333333333333';
  render(<DeliveryChain job={job([file('Card.mp4', asset), file('Card.mxf', null)])} />);
  expect(screen.getByTitle('Saved to the Library')).toBeTruthy();
  expect(screen.getByLabelText('saved')).toBeTruthy();
});
