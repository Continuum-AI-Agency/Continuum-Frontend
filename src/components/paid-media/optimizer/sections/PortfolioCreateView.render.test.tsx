import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

// PortfolioSetup is the heavy create body (its own React Query + Supabase reads). This
// view's contract is only that it mounts PortfolioSetup with the account context and
// wires the Back control, so PortfolioSetup is stubbed to a prop-echoing marker.
const setupProps = mock((_props: Record<string, unknown>) => {});
mock.module('./PortfolioSetup', () => ({
  PortfolioSetup: (props: Record<string, unknown>) => {
    setupProps(props);
    return <div data-testid="portfolio-setup">setup</div>;
  },
}));

const { PortfolioCreateView } = await import('./PortfolioCreateView');

afterEach(() => {
  cleanup();
  setupProps.mockClear();
});

describe('PortfolioCreateView', () => {
  it('renders PortfolioSetup with the account context', () => {
    const { getByTestId } = render(
      <PortfolioCreateView
        brandId="b1"
        adAccountId="act_1"
        currency="USD"
        onBack={() => {}}
        onCreated={() => {}}
      />,
    );

    expect(getByTestId('portfolio-setup')).toBeTruthy();
    expect(setupProps).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'b1', adAccountId: 'act_1', currency: 'USD' }),
    );
  });

  it('fires onBack when the Back button is clicked', () => {
    const onBack = mock(() => {});
    const { getByRole } = render(
      <PortfolioCreateView
        brandId="b1"
        adAccountId="act_1"
        currency="USD"
        onBack={onBack}
        onCreated={() => {}}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('passes onCreated straight through to PortfolioSetup', () => {
    const onCreated = () => {};
    render(
      <PortfolioCreateView
        brandId="b1"
        adAccountId="act_1"
        onBack={() => {}}
        onCreated={onCreated}
      />,
    );

    expect(setupProps).toHaveBeenCalledWith(expect.objectContaining({ onCreated }));
  });
});
