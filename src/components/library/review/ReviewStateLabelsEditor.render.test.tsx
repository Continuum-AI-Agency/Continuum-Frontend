import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// Only the save call is replaced — every other export is the real module, so this mock
// changes nothing for other test files sharing the process.
const saved: unknown[] = [];
const realReview = await import('@/lib/library/review');
mock.module('@/lib/library/review', () => ({
  ...realReview,
  saveReviewStateLabels: async (_brandId: string, labels: unknown, customStates: unknown) => {
    saved.push({ labels, customStates });
    return { labels: [], customStates: [] };
  },
}));
const { ReviewStateLabelsEditor } = await import('./ReviewStateLabelsEditor');

// The brand's stored labels can arrive after the dialog is open. If the admin has
// already typed, the arrival must not replace the draft — it used to, and Save then
// wrote the defaults over what the admin typed.
const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

describe('ReviewStateLabelsEditor', () => {
  it('keeps what the admin typed when the stored labels load afterwards', async () => {
    let releaseLabels: (response: Response) => void = () => {};
    globalThis.fetch = (() =>
      new Promise<Response>((resolve) => {
        releaseLabels = resolve;
      })) as unknown as typeof fetch;
    const brandId = crypto.randomUUID();
    render(<ReviewStateLabelsEditor brandId={brandId} open onOpenChange={() => {}} />);

    const approved = () => screen.getByLabelText('Label for approved') as HTMLInputElement;
    fireEvent.change(approved(), { target: { value: 'Client OK' } });
    expect(approved().value).toBe('Client OK');

    await act(async () =>
      releaseLabels(
        Response.json({
          labels: [{ state: 'draft', label: 'Rough cut', color: '#111111', position: 1 }],
          customStates: [],
        }),
      ),
    );
    expect(approved().value).toBe('Client OK');
  });

  it('shows the stored labels when they load before any edit', async () => {
    let releaseLabels: (response: Response) => void = () => {};
    globalThis.fetch = (() =>
      new Promise<Response>((resolve) => {
        releaseLabels = resolve;
      })) as unknown as typeof fetch;
    render(<ReviewStateLabelsEditor brandId={crypto.randomUUID()} open onOpenChange={() => {}} />);
    await act(async () =>
      releaseLabels(
        Response.json({
          labels: [{ state: 'draft', label: 'Rough cut', color: '#111111', position: 1 }],
          customStates: [],
        }),
      ),
    );
    expect((screen.getByLabelText('Label for draft') as HTMLInputElement).value).toBe('Rough cut');
  });

  it('adding a state before the stored labels load saves the brand labels and states, not the defaults', async () => {
    let releaseLabels: (response: Response) => void = () => {};
    globalThis.fetch = (() =>
      new Promise<Response>((resolve) => {
        releaseLabels = resolve;
      })) as unknown as typeof fetch;
    render(<ReviewStateLabelsEditor brandId={crypto.randomUUID()} open onOpenChange={() => {}} />);
    // The admin starts on a fresh page: a new state goes in before the fetch answers.
    fireEvent.click(screen.getByTestId('add-custom-state'));
    fireEvent.change(screen.getByLabelText('Custom state 1 name'), { target: { value: 'Legal' } });
    const signedId = crypto.randomUUID();
    await act(async () =>
      releaseLabels(
        Response.json({
          labels: [{ state: 'approved', label: 'Client OK', color: '#123456', position: 4 }],
          customStates: [
            { id: signedId, label: 'Signed', color: '#8B5CF6', baseStatus: 'approved', position: 0 },
          ],
        }),
      ),
    );
    saved.length = 0;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save labels' })));
    const sent = saved[0] as {
      labels: { state: string; label: string; color: string }[];
      customStates: { id?: string; label: string }[];
    };
    expect(sent.labels.find((label) => label.state === 'approved')).toEqual(
      expect.objectContaining({ label: 'Client OK', color: '#123456' }),
    );
    expect(sent.customStates.map((state) => state.label)).toEqual(['Signed', 'Legal']);
    expect(sent.customStates[0]?.id).toBe(signedId);
  });

  it("sends the base picked for a new custom state even when Save's handler is from an earlier render", async () => {
    globalThis.fetch = (async () =>
      Response.json({ labels: [], customStates: [] })) as unknown as typeof fetch;
    render(<ReviewStateLabelsEditor brandId={crypto.randomUUID()} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByTestId('add-custom-state'));
    fireEvent.change(screen.getByLabelText('Custom state 1 name'), {
      target: { value: 'Signed' },
    });
    // The handler a click would run if it landed before the next change re-rendered.
    const saveButton = screen.getByRole('button', { name: 'Save labels' });
    const propsKey = Object.keys(saveButton).find((key) => key.startsWith('__reactProps$'));
    const earlierOnClick = (saveButton as unknown as Record<string, { onClick: () => void }>)[
      propsKey as string
    ]?.onClick;
    fireEvent.change(screen.getByLabelText('Custom state 1 counts as'), {
      target: { value: 'approved' },
    });
    saved.length = 0;
    await act(async () => earlierOnClick?.());
    expect(saved).toHaveLength(1);
    expect((saved[0] as { customStates: { label: string; baseStatus: string }[] }).customStates).toEqual([
      expect.objectContaining({ label: 'Signed', baseStatus: 'approved' }),
    ]);
  });
});
