import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { WatchmanDeliveryPreview } from './WatchmanDeliveryPreview';

afterEach(cleanup);
const execution = { goalId: 'goal', workNodeId: 'work', harnessRunId: 'harness' };
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
      verified_at: '2026-11-26T00:00:00Z',
      artifact_ids: ['saved-draft'],
    },
  ],
  evidenceIds: [],
  openItems: {
    limitations: ['Publishing has not been verified.'],
    followUps: ['Review the saved draft.'],
  },
};

describe('teammate delivery review', () => {
  it('shows the delivery, receipt count, unverified writing, limitations and follow-ups', () => {
    const view = render(<WatchmanDeliveryPreview data={data} />);
    expect(view.getByText('The draft is ready for review.')).toBeTruthy();
    expect(view.getByText(/The writing is unverified/)).toBeTruthy();
    expect(view.getByText('1 completed operation')).toBeTruthy();
    expect(view.getByText('Publishing has not been verified.')).toBeTruthy();
    expect(view.getByText('Review the saved draft.')).toBeTruthy();
    expect(view.queryByText(/customerFindings/)).toBeNull();
  });
  it('renders the pending state without treating an incomplete draft as delivered', () => {
    const view = render(<WatchmanDeliveryPreview data={{}} />);
    expect(view.getByText('This artifact has no written evidence yet.')).toBeTruthy();
    expect(view.queryByText('1 completed operation')).toBeNull();
  });
});
