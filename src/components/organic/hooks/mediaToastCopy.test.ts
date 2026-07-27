import { describe, expect, it } from 'bun:test';

import { formatMediaReadyToast } from './mediaToastCopy';

describe('formatMediaReadyToast', () => {
  it('uses singular verb agreement for one ready draft', () => {
    expect(formatMediaReadyToast(1, 0)).toEqual({
      title: 'Media generated',
      description: '1 draft has media ready.',
    });
  });

  it('uses plural verb agreement for multiple ready drafts', () => {
    expect(formatMediaReadyToast(2, 0)).toEqual({
      title: 'Media generated',
      description: '2 drafts have media ready.',
    });
  });

  it('appends the failure count after a partial batch', () => {
    expect(formatMediaReadyToast(1, 1)).toEqual({
      title: 'Media generated',
      description: '1 draft has media ready, 1 failed.',
    });
  });

  it('keeps plural agreement alongside a failure suffix', () => {
    expect(formatMediaReadyToast(3, 2)).toEqual({
      title: 'Media generated',
      description: '3 drafts have media ready, 2 failed.',
    });
  });

  it('reports a failure-only batch', () => {
    expect(formatMediaReadyToast(0, 1)).toEqual({
      title: 'Media generation failed',
      description: '1 draft failed.',
    });
  });
});
