import { describe, expect, it, mock } from 'bun:test';
import { bufferEarlyErrors, type ExceptionSink } from './earlyErrorBuffer';

function sink(): ExceptionSink & { calls: Array<[unknown, Record<string, unknown> | undefined]> } {
  const calls: Array<[unknown, Record<string, unknown> | undefined]> = [];
  return { calls, captureException: (error, properties) => calls.push([error, properties]) };
}

// A real DOM node, and events from the SAME realm as it — Bun's global Event is a
// different class from the DOM environment's, and dispatching across the two throws.
function target(): EventTarget {
  return document.createElement('div');
}

function errorEvent(init: { error?: unknown; message?: string }): Event {
  const event = new window.Event('error');
  Object.defineProperties(event, {
    error: { value: init.error, enumerable: true },
    message: { value: init.message ?? '', enumerable: true },
  });
  return event;
}

function rejectionEvent(reason: unknown): Event {
  const event = new window.Event('unhandledrejection');
  Object.defineProperty(event, 'reason', { value: reason, enumerable: true });
  return event;
}

describe('bufferEarlyErrors', () => {
  it('replays errors thrown before the client loaded', () => {
    const node = target();
    const buffer = bufferEarlyErrors(node);

    const boom = new Error('boom');
    node.dispatchEvent(errorEvent({ error: boom }));
    expect(buffer.size).toBe(1);

    const client = sink();
    buffer.flushTo(client);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0][0]).toBe(boom);
    expect(client.calls[0][1]).toMatchObject({ buffered_before_init: true, source: 'error' });
  });

  it('replays unhandled rejections with their reason', () => {
    const node = target();
    const buffer = bufferEarlyErrors(node);
    node.dispatchEvent(rejectionEvent('nope'));

    const client = sink();
    buffer.flushTo(client);
    expect(client.calls[0][0]).toBe('nope');
    expect(client.calls[0][1]).toMatchObject({ source: 'unhandledrejection' });
  });

  it('falls back to the message when no Error object is attached', () => {
    const node = target();
    const buffer = bufferEarlyErrors(node);
    node.dispatchEvent(errorEvent({ message: 'script error' }));

    const client = sink();
    buffer.flushTo(client);
    expect(client.calls[0][0]).toBe('script error');
  });

  // The listeners must not outlive the handoff, or every later error is reported
  // twice: once by this buffer and once by posthog's own capture_exceptions.
  it('stops listening after the flush', () => {
    const node = target();
    const buffer = bufferEarlyErrors(node);
    const client = sink();
    buffer.flushTo(client);

    node.dispatchEvent(errorEvent({ error: new Error('later') }));
    expect(buffer.size).toBe(0);
    expect(client.calls).toHaveLength(0);
  });

  it('drains the buffer so a second flush cannot double-report', () => {
    const node = target();
    const buffer = bufferEarlyErrors(node);
    node.dispatchEvent(errorEvent({ error: new Error('once') }));

    const client = sink();
    buffer.flushTo(client);
    buffer.flushTo(client);
    expect(client.calls).toHaveLength(1);
  });

  it('stop() detaches without reporting anything', () => {
    const node = target();
    const buffer = bufferEarlyErrors(node);
    node.dispatchEvent(errorEvent({ error: new Error('dropped') }));
    buffer.stop();

    node.dispatchEvent(errorEvent({ error: new Error('after') }));
    expect(buffer.size).toBe(1);
  });
});
