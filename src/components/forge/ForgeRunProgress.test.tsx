/**
 * A failed run says what went wrong in words. The forge's codes (NAMING_NO_TEMPLATE_KEY and the like)
 * are for whoever has to look the failure up, so they ride in the title, never in the text.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
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
    expect(screen.getByText('The run stopped on an error.').getAttribute('title')).toBe('INTERNAL');
  });
});
