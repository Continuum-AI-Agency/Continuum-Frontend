import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { ctxFor } from '../ask/__fixtures__/readings';
import {
  GOOGLE_ACCOUNT,
  GOOGLE_NARRATIVE,
  GOOGLE_READ_TODAY,
} from '../brief/__fixtures__/accountReads';
import type { BriefRead } from '../brief/briefModel';

// The story's one extra read (the brief) and the report dialog (it reads recipients and the
// schedule on open) are replaced; `mock.module` replaces them for the whole process, so this file
// runs on its own.
let reads: BriefRead[] = [];
const realReads = await import('../brief/useBriefReads');
mock.module('../brief/useBriefReads', () => ({
  ...realReads,
  useBriefReads: () => ({ reads, retry: () => {} }),
}));

const reportDialogs: { brandId: string; open: boolean }[] = [];
mock.module('@/components/dashboard/SendContinuumReportDialog', () => ({
  SendContinuumReportDialog: ({ brandId, open }: { brandId: string; open: boolean }) => {
    reportDialogs.push({ brandId, open });
    return open ? <div data-testid="report-dialog-stub">Send Continuum Report</div> : null;
  },
}));

const { default: StoryButton } = await import('./StoryButton');

afterEach(() => {
  cleanup();
  reads = [];
  reportDialogs.length = 0;
});

async function openStory(mode: Parameters<typeof ctxFor>[0], adAccounts = [GOOGLE_ACCOUNT]) {
  render(<StoryButton ctx={ctxFor(mode, { adAccounts })} />);
  fireEvent.click(screen.getByRole('button', { name: /Weekly story/ }));
  return screen.findByTestId('home-story');
}

describe('StoryButton', () => {
  it('opens the week as slides composed from the reading and the stored brief', async () => {
    reads = [{ account: GOOGLE_ACCOUNT, status: 'success', data: GOOGLE_READ_TODAY }];
    const story = await openStory('approve');
    const list = within(story).getAllByTestId('home-story-slide-link');
    expect(list.map((item) => item.getAttribute('data-slide'))).toEqual([
      'mode',
      'goal',
      'opportunity',
      'waiting',
      'brief',
    ]);
    expect(within(story).getByTestId('home-story-slide').textContent).toContain('You approve');

    fireEvent.click(within(story).getByRole('button', { name: 'Next slide' }));
    expect(within(story).getByTestId('home-story-slide').getAttribute('data-slide')).toBe('goal');

    const brief = list.find((item) => item.getAttribute('data-slide') === 'brief');
    if (!brief) throw new Error('no brief slide');
    fireEvent.click(brief);
    expect(within(story).getByTestId('home-story-slide').textContent).toContain(GOOGLE_NARRATIVE);
  });

  it('leaves out what is empty instead of filling it', async () => {
    reads = [{ account: GOOGLE_ACCOUNT, status: 'success', data: null }];
    const story = await openStory('setup', []);
    const slides = within(story)
      .getAllByTestId('home-story-slide-link')
      .map((item) => item.getAttribute('data-slide'));
    expect(slides).toEqual(['mode', 'goal']);
  });

  it('sends the week as the Continuum Report through the existing dialog', async () => {
    const story = await openStory('operate');
    expect(screen.queryByTestId('report-dialog-stub')).toBeNull();
    fireEvent.click(within(story).getByRole('button', { name: 'Send as Continuum Report' }));
    expect(screen.getByTestId('report-dialog-stub')).toBeTruthy();
    expect(reportDialogs.at(-1)).toEqual({
      brandId: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
      open: true,
    });
    expect(screen.queryByText(/share link/i)).toBeNull();
  });
});
