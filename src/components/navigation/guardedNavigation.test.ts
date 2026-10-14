import { describe, expect, it, mock } from 'bun:test';
import { navigateAfterForgeExit } from './guardedNavigation';

describe('navigateAfterForgeExit', () => {
  it('keeps the current route when a Forge draft exit is declined', async () => {
    const navigate = mock(() => {});
    const confirm = mock(async () => false);

    navigateAfterForgeExit('/settings?section=billing', navigate, confirm);
    await Promise.resolve();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('continues the route after the Forge exit is confirmed', async () => {
    const navigate = mock((_href: string) => {});

    navigateAfterForgeExit('/settings?section=billing', navigate, async () => true);
    await Promise.resolve();

    expect(navigate).toHaveBeenCalledWith('/settings?section=billing');
  });
});
