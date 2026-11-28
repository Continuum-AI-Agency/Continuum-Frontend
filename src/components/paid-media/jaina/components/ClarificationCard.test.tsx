/**
 * A clarification turn, rendered from the parts the Backend actually sends.
 *
 * On beta the card read "Clarification needed" twice, the real question sat inside a collapsed
 * Evidence fold, and PDF/Sheets/Email exports hung off a turn that had answered nothing.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import {
  CLARIFICATION_OPTIONS,
  CLARIFICATION_QUESTION,
  clarificationTurn,
} from '@/lib/jaina/clarificationTurn.fixture';
import { toJainaChatMessage } from '@/lib/jaina/uiMessageProjection';

const wrapper = ({ children }: { children: ReactNode }) => (
  <MessageScrollerProvider>
    <MessageScroller>
      <MessageScrollerViewport>
        <MessageScrollerContent>{children}</MessageScrollerContent>
      </MessageScrollerViewport>
    </MessageScroller>
  </MessageScrollerProvider>
);

mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content, className }: { content: string; className?: string }) => (
    <div className={className} data-testid="markdown">
      {content}
    </div>
  ),
}));

const { JainaMessageItem } = await import('./JainaMessageItem');
const { ClarificationCard } = await import('./ClarificationCard');

afterEach(cleanup);

const renderTurn = (onSuggestionClick?: (query: string) => void) =>
  render(
    <JainaMessageItem
      message={toJainaChatMessage(clarificationTurn(), { isStreaming: false })}
      onSuggestionClick={onSuggestionClick}
    />,
    { wrapper },
  );

describe('a Jaina clarification', () => {
  it('sets the question, as Jaina asked it, as the card body — once', () => {
    renderTurn(() => undefined);

    expect(screen.getByTestId('jaina-clarification-question').textContent).toBe(
      CLARIFICATION_QUESTION,
    );
    expect(screen.getAllByText(CLARIFICATION_QUESTION)).toHaveLength(1);
    expect(screen.queryByText(/Clarification needed/i)).toBeNull();
    expect(screen.getAllByText('Needs your input')).toHaveLength(1);
  });

  it('offers each answer as a control that sends it through the composer path', () => {
    const sent: string[] = [];
    renderTurn((query) => sent.push(query));

    const options = within(screen.getByTestId('jaina-clarification-options'));
    expect(options.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(
      CLARIFICATION_OPTIONS,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Compras' }));
    expect(sent).toEqual(['Compras']);
  });

  it('replies once per click with the option text, then retires the options', () => {
    const sent: string[] = [];
    renderTurn((query) => sent.push(query));

    fireEvent.click(screen.getByRole('radio', { name: 'Leads' }));
    expect(sent).toEqual(['Leads']);
    // A sent reply has started the next turn: no second pick, and no Undo to take it back.
    expect(screen.queryByRole('radio', { name: 'Compras' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('sends a typed answer down the same path', () => {
    const sent: string[] = [];
    renderTurn((query) => sent.push(query));

    fireEvent.click(screen.getByRole('button', { name: /Something else/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'Ventas en tienda' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    expect(sent).toEqual(['Ventas en tienda']);
  });

  it('renders no report around it: no Evidence fold, no survey, no exports', () => {
    renderTurn(() => undefined);

    expect(screen.queryByTestId('survey-block')).toBeNull();
    expect(screen.queryByText(/was read as/)).toBeNull();
    expect(screen.queryByText('Evidence')).toBeNull();
    expect(screen.queryByText('Export PDF')).toBeNull();
    expect(screen.queryByText('Google Sheets')).toBeNull();
    expect(screen.queryByText('Email')).toBeNull();
  });

  it('shows no option buttons when nothing can send them', () => {
    renderTurn();

    expect(screen.queryByTestId('jaina-clarification-options')).toBeNull();
    expect(screen.getByTestId('jaina-clarification-question').textContent).toBe(
      CLARIFICATION_QUESTION,
    );
  });
});

describe('ClarificationCard', () => {
  it('locks every answer while Jaina is still writing', () => {
    const sent: string[] = [];
    render(
      <ClarificationCard
        question={CLARIFICATION_QUESTION}
        options={CLARIFICATION_OPTIONS}
        onSelectOption={(option) => sent.push(option)}
        disabled
      />,
    );

    for (const radio of screen.getAllByRole('radio')) {
      expect((radio as HTMLButtonElement).disabled).toBe(true);
    }
    expect(
      (screen.getByRole('button', { name: /Something else/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Leads' }));
    expect(sent).toEqual([]);
  });

  it('offers to focus the composer when an answer cannot be sent from the card', () => {
    const onFocusInput = mock(() => {});
    render(
      <ClarificationCard
        question={CLARIFICATION_QUESTION}
        options={CLARIFICATION_OPTIONS}
        onFocusInput={onFocusInput}
      />,
    );

    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reply to this' }));
    expect(onFocusInput).toHaveBeenCalledTimes(1);
  });
});
