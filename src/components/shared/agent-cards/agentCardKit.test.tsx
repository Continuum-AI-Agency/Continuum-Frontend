import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

import {
  AgentArtifactCard,
  AgentButton,
  AgentDecisionCard,
  AgentReceipt,
  ApproveRejectActions,
  MetaRow,
  PlatformTag,
  StatusLabel,
} from './agentCardKit';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

describe('agentCardKit', () => {
  afterEach(() => cleanup());

  it('renders the three card weights on top of the shadcn card slot', () => {
    const { container } = render(
      <div>
        <AgentReceipt>Receipt</AgentReceipt>
        <AgentArtifactCard>Artifact</AgentArtifactCard>
        <AgentDecisionCard>Decision</AgentDecisionCard>
      </div>,
    );

    const cards = container.querySelectorAll('[data-slot="card"]');

    expect(cards).toHaveLength(3);
    expect(cards[0].className).toContain('bg-muted/20');
    expect(cards[1].className).toContain('bg-card/75');
    expect(cards[2].className).toContain('bg-card/80');
  });

  it('keeps decision actions accessible and disabled when locked', () => {
    render(
      <ApproveRejectActions
        locked={true}
        approveLabel="Approve plan"
        onApprove={() => undefined}
        onReject={() => undefined}
      />,
    );

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Approve plan' }).disabled).toBe(
      true,
    );
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Dismiss' }).disabled).toBe(true);
  });

  it('renders compact metadata, platform identity, and loading button state', () => {
    render(
      <div>
        <MetaRow items={['Reel', null, 'Wed 9:00 AM']} />
        <PlatformTag platform="instagram" />
        <StatusLabel tone="running">Enriching</StatusLabel>
        <AgentButton loading={true}>Start</AgentButton>
      </div>,
    );

    expect(screen.getByText('Reel')).toBeDefined();
    expect(screen.getByText('Wed 9:00 AM')).toBeDefined();
    expect(screen.getByText('instagram')).toBeDefined();
    expect(screen.getByText('Enriching')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Starting…' }).getAttribute('aria-busy')).toBe(
      'true',
    );
  });
});
