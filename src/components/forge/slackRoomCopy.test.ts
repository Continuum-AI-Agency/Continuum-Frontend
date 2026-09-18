import { describe, expect, test } from 'bun:test';
import { ApiError } from '@/lib/api/errors';
import { describeSlackFailure } from './slackRoomCopy';

describe('describeSlackFailure', () => {
  test('the server’s bare catch-all 500 reads as words about Slack, not its code', () => {
    const thrown = new ApiError('api_render_failed', 500, undefined, {
      error: 'api_render_failed',
    });
    expect(describeSlackFailure(thrown)).toBe(
      'Continuum hit an unexpected error talking to Slack. Try again; if it keeps failing, tell your Continuum contact.',
    );
  });

  test('every Slack code the backend returns has words', () => {
    for (const code of [
      'slack_not_connected',
      'slack_not_installed',
      'slack_channel_not_found',
      'chat_destination_write_failed',
      'render_slack_destination_not_found',
    ]) {
      expect(describeSlackFailure(new ApiError(code, 409))).not.toContain(code);
    }
  });

  test('a new code with a sentence detail shows the sentence', () => {
    const detail = 'Slack refused to list this workspace’s channels. Reinstall the app to fix it.';
    const thrown = new ApiError('slack_something_new', 502, undefined, {
      error: 'slack_something_new',
      detail,
    });
    expect(describeSlackFailure(thrown)).toBe(detail);
  });
});
