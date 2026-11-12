import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { LiveChangePreviewPayload } from '@continuum/contracts';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { LiveChangeConfirmBar } from './LiveChangeConfirmBar';

afterEach(cleanup);

const preview = (partId: string, overrides: Partial<LiveChangePreviewPayload> = {}) =>
  ({
    approvalId: `appr_${partId}`,
    toolCallId: `call_${partId}`,
    toolName: 'pause_meta_entity',
    partId,
    subject: null,
    currency: 'MXN',
    nodes: [],
    truncated: false,
    counts: { changed: 0, added: 0, paused: 1 },
    readAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }) as LiveChangePreviewPayload;

// Mirrors the host: the bar is keyed on the preview's part id.
const Host = (props: {
  preview: LiveChangePreviewPayload;
  decision: 'pending' | 'proposal' | 'approved';
  pendingDecision?: 'approve' | 'deny' | null;
  variants?: Array<{
    variant: 'apply' | 'pause_for_review';
    label: string;
  }> | null;
  onDecide?: (d: 'approve' | 'deny', v?: 'apply' | 'pause_for_review') => void;
  onImplement?: () => void;
  implementBlocked?: boolean;
}) => (
  <LiveChangeConfirmBar
    key={props.preview.partId}
    preview={props.preview}
    decision={props.decision}
    pendingDecision={props.pendingDecision ?? null}
    variants={props.variants ?? null}
    {...(props.onDecide ? { onDecide: props.onDecide } : {})}
    {...(props.onImplement ? { onImplement: props.onImplement } : {})}
    {...(props.implementBlocked ? { implementBlocked: true } : {})}
  />
);

describe('LiveChangeConfirmBar', () => {
  it('after Implement, the pending approval preview has an enabled Confirm', () => {
    const implement = mock(() => {});
    const decide = mock(() => {});
    const proposal = preview('change-projection:p1', {
      origin: 'proposal',
      approvalId: 'proposal:p1',
    });
    const view = render(
      <Host preview={proposal} decision="proposal" onImplement={implement} onDecide={decide} />,
    );
    fireEvent.click(screen.getByTestId('live-change-implement'));
    expect(implement).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId('live-change-implement') as HTMLButtonElement).disabled).toBe(true);

    view.rerender(
      <Host
        preview={preview('live-change:a')}
        decision="pending"
        onImplement={implement}
        onDecide={decide}
      />,
    );
    const confirm = screen.getByTestId('live-change-approve-apply') as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(decide).toHaveBeenCalledWith('approve', undefined);
  });

  describe('Implement these changes while Jaina is busy', () => {
    const proposal = () =>
      preview('change-projection:p1', {
        origin: 'proposal',
        approvalId: 'proposal:p1',
      });
    const button = () => screen.getByTestId('live-change-implement') as HTMLButtonElement;

    it('is disabled while a run holds the conversation, and a click then sends nothing', () => {
      const implement = mock(() => {});
      render(
        <Host preview={proposal()} decision="proposal" onImplement={implement} implementBlocked />,
      );
      expect(button().disabled).toBe(true);
      fireEvent.click(button());
      expect(implement).not.toHaveBeenCalled();
    });

    it('sends one click once, however many times it is pressed', () => {
      const implement = mock(() => {});
      render(<Host preview={proposal()} decision="proposal" onImplement={implement} />);
      fireEvent.click(button());
      fireEvent.click(button());
      expect(implement).toHaveBeenCalledTimes(1);
    });

    it('keeps saying it is asking until the turn has run, then offers the button again if nothing came of it', () => {
      const implement = mock(() => {});
      const view = render(
        <Host preview={proposal()} decision="proposal" onImplement={implement} />,
      );
      fireEvent.click(button());
      expect(screen.getByText('Asking Jaina…')).toBeTruthy();

      // The turn is pending, then running: the click is not lost and nothing can send it twice.
      view.rerender(
        <Host preview={proposal()} decision="proposal" onImplement={implement} implementBlocked />,
      );
      expect(button().disabled).toBe(true);
      expect(screen.getByText('Asking Jaina…')).toBeTruthy();

      // The run ended and the proposal is still a proposal: the person may ask again.
      view.rerender(<Host preview={proposal()} decision="proposal" onImplement={implement} />);
      expect(button().disabled).toBe(false);
      expect(screen.getByText('Implement these changes')).toBeTruthy();
      expect(implement).toHaveBeenCalledTimes(1);
    });

    it('says Jaina is working when the run is not the one this click started', () => {
      render(
        <Host preview={proposal()} decision="proposal" onImplement={() => {}} implementBlocked />,
      );
      expect(screen.getByText('Jaina is working…')).toBeTruthy();
    });
  });

  it('confirming preview A does not disable preview B', () => {
    const decide = mock(() => {});
    const view = render(
      <Host preview={preview('live-change:a')} decision="pending" onDecide={decide} />,
    );
    fireEvent.click(screen.getByTestId('live-change-approve-apply'));
    view.rerender(
      <Host
        preview={preview('live-change:b')}
        decision="pending"
        pendingDecision={null}
        onDecide={decide}
      />,
    );
    expect((screen.getByTestId('live-change-approve-apply') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('a decision already in flight (from the card or the canvas) disables both and says so', () => {
    render(
      <Host
        preview={preview('live-change:a')}
        decision="pending"
        pendingDecision="approve"
        onDecide={() => {}}
      />,
    );
    expect((screen.getByTestId('live-change-approve-apply') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('live-change-deny') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Approving…')).toBeTruthy();
  });

  it('a failed send clears the in-flight decision and the buttons come back', () => {
    const decide = mock(() => {});
    const view = render(
      <Host
        preview={preview('live-change:a')}
        decision="pending"
        pendingDecision="approve"
        onDecide={decide}
      />,
    );
    view.rerender(
      <Host
        preview={preview('live-change:a')}
        decision="pending"
        pendingDecision={null}
        onDecide={decide}
      />,
    );
    expect((screen.getByTestId('live-change-approve-apply') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("offers the card's second choice and sends it", () => {
    const decide = mock(() => {});
    render(
      <Host
        preview={preview('live-change:a', {
          toolName: 'change_meta_budget_bid',
        })}
        decision="pending"
        onDecide={decide}
        variants={[
          { variant: 'apply', label: 'Apply changes' },
          {
            variant: 'pause_for_review',
            label: 'Pause these ad sets for review',
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByText('Pause these ad sets for review'));
    expect(decide).toHaveBeenCalledWith('approve', 'pause_for_review');
  });

  it('says a Google proposal cannot be applied from the canvas', () => {
    render(
      <Host
        preview={preview('change-projection:g', {
          origin: 'proposal',
          platform: 'google',
        })}
        decision="proposal"
        onImplement={() => {}}
      />,
    );
    expect(screen.queryByTestId('live-change-implement')).toBeNull();
    expect(screen.getByText(/cannot change Google Ads yet/)).toBeTruthy();
  });

  it('shows nothing once the edit is decided', () => {
    render(<Host preview={preview('live-change:a')} decision="approved" onDecide={() => {}} />);
    expect(screen.queryByTestId('live-change-confirm')).toBeNull();
  });
});
