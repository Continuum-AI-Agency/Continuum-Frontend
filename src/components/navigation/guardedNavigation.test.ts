import { describe, expect, it, mock } from 'bun:test';
import { navigateAfterForgeExit, runAfterForgeExit } from './guardedNavigation';

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


describe('command actions leaving a Forge draft', () => {
  it('defers a brand switch until the draft decision resolves', async () => {
    let decide!: (allowed: boolean) => void;
    const decision = new Promise<boolean>((resolve) => { decide = resolve; });
    const switchBrand = mock(() => {});
    runAfterForgeExit(switchBrand, () => decision);
    await Promise.resolve();
    expect(switchBrand).not.toHaveBeenCalled();
    decide(false);
    await Promise.resolve();
    expect(switchBrand).not.toHaveBeenCalled();
  });

  it('switches the brand once after the draft is safely saved', async () => {
    const switchBrand = mock(() => {});
    runAfterForgeExit(switchBrand, async () => true);
    await Promise.resolve();
    expect(switchBrand).toHaveBeenCalledTimes(1);
  });
});
