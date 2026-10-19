import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { ForgePreviewBridge } from './previewBridge';

afterEach(() => cleanup());

describe('ForgePreviewBridge', () => {
  test('loads with scripts only and accepts readiness only from its own frame with the nonce', async () => {
    const frame = document.createElement('iframe');
    const other = document.createElement('iframe');
    document.body.append(frame, other);
    const bridge = new ForgePreviewBridge(frame);
    bridge.load('<!doctype html><html><head><title>Preview</title></head><body></body></html>');

    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.srcdoc).toContain(`window.__FORGE_NONCE__="${bridge.nonce}"`);

    const message = (source: MessageEventSource | null, nonce: string) => {
      // Happy DOM only accepts MessagePort values in MessageEventInit.source;
      // browser WindowProxy values are valid in real postMessage events.
      const event = new Event('message') as MessageEvent;
      Object.defineProperties(event, {
        source: { value: source },
        data: {
          value: { channel: 'forge-web-component', nonce, event: 'ready', nodes: [] },
        },
      });
      return event;
    };
    window.dispatchEvent(message(other.contentWindow, bridge.nonce));
    window.dispatchEvent(message(frame.contentWindow, 'wrong-nonce-value-123456'));

    let ready = false;
    void bridge.ready.then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);

    window.dispatchEvent(message(frame.contentWindow, bridge.nonce));
    await expect(bridge.ready).resolves.toEqual([]);
    await bridge.dispose();
    expect(frame.srcdoc).toBe('');
  });
});
