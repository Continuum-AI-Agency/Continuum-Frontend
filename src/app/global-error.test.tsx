import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GlobalError from './global-error';

afterEach(() => {
  cleanup();
  mock.restore();
});

describe('GlobalError', () => {
  // A tab opened before a deploy keeps calling the old build's Server Action ids. reset() only
  // re-renders that same stale bundle, so on 2026-11-10 onboarding's "Reload" put the user back on
  // step 3 to fail again. Only a page load fetches the current build.
  it('reloads the page instead of re-rendering the crashed tree', () => {
    const reload = spyOn(window.location, 'reload').mockImplementation(() => {});

    // global-error renders its own <html>, so it mounts on the document, as Next mounts it.
    render(<GlobalError />, { container: document });
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
