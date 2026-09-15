import { describe, expect, test } from 'bun:test';
import { renderCheckOf, renderCheckWords } from './render-check';

const MEASURED = { comp: null, slots: [], escalate: false, why: 'every slot fits' };
const ESCALATED = { comp: null, slots: [], escalate: true, why: 'rigged slot' };

const frame = (ratio: string, state: 'pass' | 'fail' | 'unknown') => ({
  outputId: `id-${ratio}`,
  fileName: `Hero_${ratio.replace(':', '_')}_abc.jpg`,
  ratio,
  state,
});

describe('what counts as checked', () => {
  test('judge verdict first, then the placement check, and nothing measured is unchecked', () => {
    expect(renderCheckOf({ fit: null, judge: { state: 'pass' } })).toBe('pass');
    expect(renderCheckOf({ fit: MEASURED, judge: null })).toBe('pass');
    expect(renderCheckOf({ fit: ESCALATED, judge: null })).toBe('pending');
    expect(renderCheckOf({ fit: null, judge: null })).toBe('unchecked');
  });
});

describe('the words Slack and the UI both say', () => {
  test('a pass names the check that passed it', () => {
    expect(renderCheckWords({ fit: MEASURED, judge: null })).toBe('Checked: placement passed');
    expect(renderCheckWords({ fit: ESCALATED, judge: { state: 'pass' } })).toBe(
      'Checked: the judge passed this frame',
    );
  });

  test('with frames, the formats are named', () => {
    const judge = {
      state: 'fail',
      frames: [frame('16:9', 'pass'), frame('1:1', 'pass'), frame('9:16', 'fail')],
    };
    expect(renderCheckWords({ fit: ESCALATED, judge })).toBe('Checked: the judge flagged 9:16');
    expect(
      renderCheckWords({
        fit: ESCALATED,
        judge: { state: 'pass', frames: [frame('16:9', 'pass'), frame('9:16', 'pass')] },
      }),
    ).toBe('Checked: the judge passed 16:9 · 9:16');
    expect(
      renderCheckWords({
        fit: ESCALATED,
        judge: { state: 'unknown', frames: [frame('16:9', 'pass'), frame('1:1', 'unknown')] },
      }),
    ).toBe('Not checked: the judge could not run on 1:1');
  });

  test('the states nothing has passed', () => {
    expect(renderCheckWords({ fit: ESCALATED, judge: null })).toBe('Waiting on the judge');
    expect(renderCheckWords({ fit: null, judge: null })).toBe(
      'Not checked: no media placement to measure',
    );
    expect(renderCheckWords({ fit: ESCALATED, judge: { state: 'unknown' } })).toBe(
      'Not checked: the judge could not run',
    );
  });
});
