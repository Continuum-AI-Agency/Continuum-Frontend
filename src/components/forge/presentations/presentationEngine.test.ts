import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { presentationDocumentSchema } from '@continuum/contracts';
import { PresentationEngine } from './presentationEngine';

const originalWorker = globalThis.Worker;
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  messages: Array<{ id: number; request: { operation: string } }> = [];
  terminated = false;
  constructor() {
    TestWorker.instances.push(this);
  }
  postMessage(message: { id: number; request: { operation: string } }) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(id: number, result: unknown) {
    this.onmessage?.({ data: { id, result } } as MessageEvent<unknown>);
  }
}
beforeEach(() => {
  TestWorker.instances = [];
  globalThis.Worker = TestWorker as unknown as typeof Worker;
});
afterEach(() => {
  globalThis.Worker = originalWorker;
});
const doc = presentationDocumentSchema.parse({
  schemaVersion: 1,
  id: 'deck',
  title: 'Deck',
  revision: 0,
  engineVersion: 'pinned-version',
  source: null,
  nativeDocument: 'native',
  size: { width: 720, height: 405 },
  slides: [],
  fields: [],
  diagnostics: [],
  capabilities: {},
});

describe('PresentationEngine', () => {
  test('validates the native version before sending a document to WASM', async () => {
    const engine = new PresentationEngine();
    const worker = TestWorker.instances[0];
    const rendered = engine.process({ operation: 'render', document: doc, slideId: 'slide-a' });
    expect(worker.messages[0].request.operation).toBe('capabilities');
    worker.reply(worker.messages[0].id, { ok: true, engineVersion: 'wrong-version' });
    await expect(rendered).rejects.toThrow('do not match');
    expect(worker.messages).toHaveLength(1);
    engine.dispose();
  });
  test('correlates concurrent replies without assigning a preview to the wrong slide', async () => {
    const engine = new PresentationEngine();
    const worker = TestWorker.instances[0];
    const first = engine.process({ operation: 'capabilities' });
    const second = engine.process({ operation: 'capabilities' });
    worker.reply(worker.messages[1].id, { ok: true, engineVersion: 'second' });
    worker.reply(worker.messages[0].id, { ok: true, engineVersion: 'first' });
    expect(await first).toMatchObject({ engineVersion: 'first' });
    expect(await second).toMatchObject({ engineVersion: 'second' });
    engine.dispose();
  });
  test('engine failures propagate before an optimistic edit can be accepted', async () => {
    const engine = new PresentationEngine();
    const worker = TestWorker.instances[0];
    const pending = engine.process({ operation: 'create', title: 'Deck' });
    worker.reply(worker.messages[0].id, {
      ok: false,
      error: { code: 'invalid_document', message: 'Cannot read this document' },
    });
    await expect(pending).rejects.toThrow('Cannot read this document');
    engine.dispose();
  });
  test('closing the workspace rejects outstanding work and terminates its worker', async () => {
    const engine = new PresentationEngine();
    const pending = engine.process({ operation: 'capabilities' });
    engine.dispose();
    await expect(pending).rejects.toThrow('closed');
    expect(TestWorker.instances[0].terminated).toBe(true);
    await expect(engine.process({ operation: 'capabilities' })).rejects.toThrow('closed');
  });
});
