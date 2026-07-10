import { describe, expect, it } from 'bun:test';
import { summarizeReportRecipients } from './sendPulseReport';

describe('summarizeReportRecipients', () => {
  it('handles an empty list', () => {
    expect(summarizeReportRecipients([])).toContain('No recipients');
  });

  it('names a single recipient', () => {
    expect(summarizeReportRecipients(['duane@trycontinuum.ai'])).toBe(
      'Sent to duane@trycontinuum.ai.',
    );
  });

  it('summarizes two recipients without a plural trailing s', () => {
    expect(summarizeReportRecipients(['a@x.com', 'b@x.com'])).toBe(
      'Sent to a@x.com and 1 other recipient.',
    );
  });

  it('pluralizes three or more recipients', () => {
    expect(summarizeReportRecipients(['a@x.com', 'b@x.com', 'c@x.com'])).toBe(
      'Sent to a@x.com and 2 other recipients.',
    );
  });
});
