/**
 * A failed run says what went wrong in words. The forge's codes (NAMING_NO_TEMPLATE_KEY and the like)
 * are for whoever has to look the failure up, so they ride in the title, never in the text.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TemplateRunRow } from '@/lib/library/templateSources';
import { ForgeRunProgress } from './ForgeRunProgress';

afterEach(cleanup);

const FAILED: TemplateRunRow = {
  run_id: 'run-1',
  state: 'failed',
  done: true,
  ok: false,
  progress: null,
  findings: [
    {
      code: 'FONT_NOT_INSTALLED',
      what: 'A font is missing',
      why: 'HeadingNow is not installed on the render fleet',
      resolver: null,
    },
  ],
  needs: [],
  error: { code: 'NAMING_NO_TEMPLATE_KEY', message: 'The build has no template name yet' },
  root_table: null,
  application: null,
};

describe('ForgeRunProgress', () => {
  test('errors and findings read as words, with their codes kept in the title', () => {
    const { container } = render(<ForgeRunProgress run={FAILED} />);
    for (const details of container.querySelectorAll('details')) details.setAttribute('open', '');

    expect(container.textContent).not.toMatch(/NAMING_NO_TEMPLATE_KEY|FONT_NOT_INSTALLED/);
    expect(
      screen
        .getByText('The build has no template name yet')
        .closest('[title]')
        ?.getAttribute('title'),
    ).toBe('NAMING_NO_TEMPLATE_KEY');
    const finding = screen.getByText(/A font is missing/).closest('li')!;
    expect(finding.textContent).toContain('HeadingNow is not installed on the render fleet');
    expect(finding.getAttribute('title')).toBe('FONT_NOT_INSTALLED');
  });

  test('an error with no message still says something a person can read', () => {
    const { container } = render(
      <ForgeRunProgress run={{ ...FAILED, findings: [], error: { code: 'INTERNAL' } }} />,
    );
    expect(container.textContent).not.toContain('INTERNAL');
    expect(screen.getByText('Setup stopped on an error.').getAttribute('title')).toBe('INTERNAL');
  });
});

describe('ForgeRunProgress header', () => {
  const RUNNING: TemplateRunRow = {
    ...FAILED,
    state: 'building',
    done: false,
    ok: null,
    findings: [],
    error: null,
    progress: {
      total: 24,
      done: 14,
      pct: 58,
      phase: 'build',
      detail: 'Putting together 14 of 24 columns',
      phases: [],
    },
  };

  test('reads product · title · status in one row, with no elapsed time to show', () => {
    render(<ForgeRunProgress run={RUNNING} title="EasyFit menu board" />);
    const header = screen.getByTestId('forge-run-header');
    expect(header.textContent).toContain('Forge');
    expect(header.textContent).toContain('EasyFit menu board');
    expect(header.textContent).toContain('Setting up');
    // The run row has no start time, so nothing reads as a clock.
    expect(header.textContent).not.toMatch(/\d+:\d{2}/);
  });

  test('keeps the phase checklist under the header', () => {
    render(
      <ForgeRunProgress
        run={{
          ...RUNNING,
          progress: {
            ...(RUNNING.progress as NonNullable<TemplateRunRow['progress']>),
            phases: [
              { name: 'analyze', total: 1, done: 1 },
              { name: 'build', total: 24, done: 14 },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText('Read your file')).toBeTruthy();
    expect(screen.getByText('14/24')).toBeTruthy();
  });

  test('the status is said once: the header carries the only pill', () => {
    const { container } = render(<ForgeRunProgress run={RUNNING} />);
    expect(container.textContent?.match(/Setting up/g)?.length).toBe(1);
  });

  test('Review shows for a run waiting on an answer, and calls the handler', () => {
    const onReview = mock(() => undefined);
    render(
      <ForgeRunProgress
        run={{ ...RUNNING, state: 'needs_input', done: true }}
        onReview={onReview}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  test('no Review for a working run, and none without a handler', () => {
    const { rerender } = render(<ForgeRunProgress run={RUNNING} onReview={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
    rerender(<ForgeRunProgress run={{ ...RUNNING, state: 'needs_input', done: true }} />);
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
  });
});

describe('ForgeRunProgress on a failed run', () => {
  // Regression: a run that failed before its file was read has no total. It used to draw the
  // indeterminate sweep and say "Working out how much there is to do…", as if still running.
  test('shows a still bar and no in-progress copy', () => {
    const { container } = render(<ForgeRunProgress run={FAILED} />);
    expect(container.textContent).not.toContain('Working out how much there is to do');
    expect(container.querySelector('[class*="forge-indeterminate"]')).toBeNull();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).not.toBe(
      'Working out how much there is to do',
    );
  });

  test('a failed run keeps where it stopped and drops its in-progress detail', () => {
    const { container } = render(
      <ForgeRunProgress
        run={{
          ...FAILED,
          progress: {
            total: 24,
            done: 9,
            pct: 37,
            phase: 'build',
            detail: 'Putting together 9 of 24 columns',
            phases: [],
          },
        }}
      />,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('37');
    expect(container.textContent).not.toContain('Putting together 9 of 24 columns');
  });

  test('a run still being read keeps the indeterminate sweep', () => {
    render(
      <ForgeRunProgress
        run={{ ...FAILED, state: 'analyzing', done: false, ok: null, error: null, findings: [] }}
      />,
    );
    expect(screen.getByText('Working out how much there is to do…')).toBeTruthy();
  });
});
