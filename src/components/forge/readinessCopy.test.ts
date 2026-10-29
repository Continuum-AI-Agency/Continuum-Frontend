import { describe, expect, test } from 'bun:test';
import { READINESS_CODE, readinessOf } from '@continuum/contracts';
import { explainFinding, readinessLine } from './readinessCopy';

const labelOf = (key: string | undefined) =>
  ({ logo: 'Logo', title: 'Title', bg: 'Background' })[key ?? ''];
const finding = (code: string, variableKey?: string, severity: 'unknown' | 'warn' = 'unknown') => ({
  code,
  severity,
  message: `server says ${code}`,
  ...(variableKey ? { variableKey } : {}),
});

describe('what a finding means, in words', () => {
  test('each finding says what was not checked and what makes it checkable', () => {
    expect(explainFinding(finding(READINESS_CODE.fitUnknown, 'logo'), labelOf)).toContain(
      'Re-parse the template',
    );
    expect(explainFinding(finding('BRAND_PALETTE_UNKNOWN', 'bg'), labelOf)).toContain(
      'no colour palette',
    );
    expect(explainFinding(finding(READINESS_CODE.checkedAfterRender, 'title'), labelOf)).toContain(
      'finished frame',
    );
    expect(explainFinding(finding('SOMETHING_NEW'), labelOf)).toBe('server says SOMETHING_NEW');
  });

  test('an incomplete check names its first reason, how many more there are, and that it still renders', () => {
    const line = readinessLine(
      readinessOf([
        [finding(READINESS_CODE.fitUnknown, 'logo'), finding('BRAND_PALETTE_UNKNOWN', 'bg')],
        [finding(READINESS_CODE.fitUnknown, 'logo')],
        [],
      ]),
      labelOf,
    );
    expect(line).toBe(
      'Check incomplete · 2 rows: Logo has no measured placement (+1 more) — they can still render',
    );
  });

  test('a ready batch says which slots get their check after render', () => {
    expect(
      readinessLine(
        readinessOf([[finding(READINESS_CODE.checkedAfterRender, 'title')], []]),
        labelOf,
      ),
    ).toBe('Can render · 2 rows · Title is checked after render');
    expect(readinessLine(readinessOf([[], []]), labelOf)).toBe('Can render · 2 rows checked');
  });
});
