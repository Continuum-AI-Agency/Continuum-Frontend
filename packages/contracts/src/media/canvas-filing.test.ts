import { describe, expect, it } from 'bun:test';
import { canvasOutputFiling, isCanvasLibrarySinkNodeType } from './canvas-filing';

describe('canvasOutputFiling', () => {
  it('keeps action outputs off the Library until Keep or a library sink', () => {
    expect(canvasOutputFiling({ keep: false, wiredToLibrarySink: false })).toBe('graph_durable');
  });

  it('registers when the operator marks Keep', () => {
    expect(canvasOutputFiling({ keep: true, wiredToLibrarySink: false })).toBe(
      'library_registered',
    );
  });

  it('registers when the node is wired to Export or API Render', () => {
    expect(canvasOutputFiling({ keep: false, wiredToLibrarySink: true })).toBe(
      'library_registered',
    );
    expect(isCanvasLibrarySinkNodeType('export')).toBe(true);
    expect(isCanvasLibrarySinkNodeType('apiRender')).toBe(true);
    expect(isCanvasLibrarySinkNodeType('action')).toBe(false);
  });
});
