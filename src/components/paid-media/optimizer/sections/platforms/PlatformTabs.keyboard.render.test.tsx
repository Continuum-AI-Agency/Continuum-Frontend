import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PlatformTabs } from './PlatformTabs';

afterEach(cleanup);

const CONNECTED = { meta: true, google_ads: true, tiktok_ads: false };

// PP-DT-E-platform-tabs-no-arrow-keys (deep test 2026-10-31, lane E): the Overview's platform row
// is a role=tablist, so a keyboard user expects it to be one Tab stop with the arrows moving
// between platforms; every tab was its own stop and ArrowRight did nothing.
describe('PlatformTabs from the keyboard', () => {
  it('is one Tab stop on the picked platform', () => {
    render(<PlatformTabs connected={CONNECTED} onChange={() => undefined} value="google_ads" />);

    const stops = ['all', 'meta', 'google_ads', 'tiktok_ads'].map(
      (tab) => screen.getByTestId(`platform-tab-${tab}`).tabIndex,
    );
    expect(stops).toEqual([-1, -1, 0, -1]);
  });

  it('picks the next platform with the arrows and takes focus there', () => {
    const onChange = mock((_tab: string) => undefined);
    render(<PlatformTabs connected={CONNECTED} onChange={onChange} value="google_ads" />);
    const google = screen.getByTestId('platform-tab-google_ads');
    google.focus();

    fireEvent.keyDown(google, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenLastCalledWith('tiktok_ads');
    expect(document.activeElement).toBe(screen.getByTestId('platform-tab-tiktok_ads'));
  });
});
