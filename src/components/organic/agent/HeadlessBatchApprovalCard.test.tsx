import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { HeadlessBatchQuote } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ToolApprovalCard } from './ToolApprovalCard';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const quote: HeadlessBatchQuote = {
  items: 12,
  reels: 8,
  stillSets: 4,
  capUsd: 92,
  copyUsd: 0.6,
  castPackUsd: 16,
  boundUsd: 108.6,
  expectedUsd: 32.12,
  maxUsd: 148,
  windowRemainingUsd: 150,
  castApprovalNeeded: true,
  refusal: null,
};

function renderCard(batchPreview: HeadlessBatchQuote | undefined) {
  const onApprove = mock(() => {});
  const onDeny = mock(() => {});
  const view = render(
    <ToolApprovalCard
      approval={{
        approvalId: 'a1',
        toolCallId: 'c1',
        toolName: 'headlessBatchCreate',
        input: {
          items: [{ format: 'reel', slot: { draftId: '33333333-3333-4333-8333-333333333333' } }],
        },
        ...(batchPreview ? { batchPreview } : {}),
      }}
      onApproveAction={onApprove}
      onDenyAction={onDeny}
    />,
  );
  const field = (name: string) =>
    view.container.querySelector(`[data-field="${name}"]`)?.textContent ?? null;
  return { ...view, field, onApprove, onDeny };
}

describe('HeadlessBatchApprovalCard', () => {
  afterEach(() => cleanup());

  it('shows what the batch makes and its money in dollars, with no ids', () => {
    const { container, field } = renderCard(quote);
    expect(container.querySelector('[data-slot="headless-batch-approval"]')).toBeTruthy();
    expect(field('items')).toBe('12');
    expect(field('reels')).toBe('8');
    expect(field('still-sets')).toBe('4');
    expect(field('bound-usd')).toBe('$108.60');
    expect(field('cap-usd')).toBe('$92.00');
    expect(field('copy-usd')).toBe('$0.60');
    expect(field('cast-pack-usd')).toBe('$16.00');
    expect(field('expected-usd')).toBe('$32.12');
    expect(field('max-usd')).toBe('$148.00');
    expect(field('window-remaining-usd')).toBe('$150.00');
    expect(field('cast-step')).toContain('you approve them once on the batch card');
    expect(container.querySelector('[data-field="reels"]')?.closest('p')?.textContent).toBe(
      '8 reels · 4 still sets',
    );
    expect(container.textContent).toContain('First pass up to $108.60');
    expect(container.textContent).toContain('With re-directs, up to');
    expect(container.textContent).not.toMatch(UUID);
  });

  it('names the card by what it makes, and the batch in both buttons, visible word first', () => {
    const { getByRole } = renderCard(quote);
    expect(getByRole('group', { name: 'Make 12 pieces' }).dataset.slot).toBe(
      'headless-batch-approval',
    );
    expect(
      getByRole('button', { name: 'Approve batch of 12 pieces, first pass up to $108.60' }),
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Deny batch of 12 pieces' })).toBeTruthy();
  });

  it('omits the window, the cast step, a zero part and zero costs when they do not apply', () => {
    const { field, container } = renderCard({
      ...quote,
      items: 3,
      reels: 3,
      stillSets: 0,
      copyUsd: 0,
      castPackUsd: 0,
      windowRemainingUsd: null,
      castApprovalNeeded: false,
    });
    expect(field('reels')).toBe('3');
    expect(field('still-sets')).toBeNull();
    expect(field('copy-usd')).toBeNull();
    expect(field('cast-pack-usd')).toBeNull();
    expect(field('window-remaining-usd')).toBeNull();
    expect(field('cast-step')).toBeNull();
    expect(container.textContent).not.toContain('still set');
  });

  it('says a refusal in its own words from the numbers, and cannot be approved', () => {
    const backendText = 'The batch is over its $148.00 maxUsd. Nothing was asked or spent.';
    const { container, field, getByRole, onApprove, onDeny } = renderCard({
      ...quote,
      windowRemainingUsd: 20,
      refusal: backendText,
    });
    expect(field('refusal')).toBe(
      "Only $20.00 is left in the brand's 24 h window. Nothing was spent.",
    );
    expect(container.textContent).not.toContain('maxUsd');
    const approve = getByRole('button', { name: /^Approve/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(approve);
    fireEvent.click(getByRole('button', { name: /^Deny/ }));
    expect(onApprove).toHaveBeenCalledTimes(0);
    expect(onDeny).toHaveBeenCalledTimes(1);
    cleanup();

    expect(renderCard({ ...quote, maxUsd: 100, refusal: backendText }).field('refusal')).toBe(
      "Worst case $108.60 is over this batch's $100.00 ceiling. Nothing was spent.",
    );
    cleanup();
    expect(renderCard({ ...quote, refusal: backendText }).field('refusal')).toBe(
      "This batch can't be approved as asked. Nothing was spent.",
    );
  });

  it('fails closed without a readable quote: only Deny, never the generic Approve', () => {
    const { container, queryByRole, getByRole, onDeny } = renderCard(undefined);
    const card = container.querySelector('[data-slot="headless-batch-approval"]');
    expect(card?.getAttribute('data-quote')).toBe('unreadable');
    expect(card?.textContent).toContain(
      "The cost of this batch could not be read, so it can't be approved here.",
    );
    expect(queryByRole('button', { name: /Approve/ })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Deny batch' }));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });
});
