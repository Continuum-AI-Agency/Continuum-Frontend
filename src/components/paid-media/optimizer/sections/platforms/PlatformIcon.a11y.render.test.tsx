import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { PlatformIcon } from './PlatformChip';

afterEach(cleanup);

// PP-DT-E-platform-logo-read-twice (deep test 2026-10-31, lane E): PlatformIcon asks for its mark
// to be hidden from assistive tech (aria-hidden), but makeSvgIcon dropped every prop except
// className, so each tab of the 10-31 platform switch was named twice ("Meta Meta",
// "Google Ads Google") — the mark's title, then the tab's text.
describe('PlatformIcon beside a platform name', () => {
  it('keeps the brand mark out of the accessible name', () => {
    const { container } = render(<PlatformIcon platform="meta" />);
    const mark = container.firstElementChild;
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
  });
});
