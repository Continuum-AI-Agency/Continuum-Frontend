import { describe, expect, it } from 'bun:test';
import { readUIMessageStream, type UIMessageChunk } from 'ai';
import {
  CANCELLED_RUN_TEXT,
  INTERRUPTED_RUN_TEXT,
  jainaRunFailureNotice,
} from './runFailureNotice';

/** The error the SDK raises on the orphan chunk from the beta conversation, produced by the SDK. */
const orphanToolError = async (): Promise<unknown> => {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: 'start', messageId: 'jaina:run_7f3e:assistant' });
      controller.enqueue({
        type: 'tool-output-available',
        toolCallId: 'phase2_get_ad_creative_preview_3044ae04-5c1b-4f2e-9d7a-0b1c2d3e4f50',
        output: {},
        dynamic: true,
      });
      controller.close();
    },
  });
  try {
    for await (const _ of readUIMessageStream({ stream, terminateOnError: true })) {
      // drain
    }
  } catch (error) {
    return error;
  }
  throw new Error('expected the SDK to reject the orphan chunk');
};

describe('jainaRunFailureNotice', () => {
  it('says a run with a broken log was interrupted, and offers no resume', async () => {
    const notice = jainaRunFailureNotice(await orphanToolError());
    expect(notice).toEqual({ text: INTERRUPTED_RUN_TEXT, canResume: false });
    expect(notice.text).not.toContain('No tool invocation found');
  });

  it('says a cancelled run was stopped, instead of "Couldn\'t load Jaina\'s answer"', () => {
    // What the SDK raises for the Backend's terminal `error` chunk `{ errorText: 'Run cancelled.' }`.
    expect(jainaRunFailureNotice(new Error('Run cancelled.'))).toEqual({
      text: CANCELLED_RUN_TEXT,
      canResume: false,
    });
  });

  it('keeps Try again for a transport failure resuming can recover', () => {
    const notice = jainaRunFailureNotice(new TypeError('Failed to fetch'));
    expect(notice.canResume).toBe(true);
    expect(notice.text.startsWith("Couldn't load Jaina's answer")).toBe(true);
  });
});
