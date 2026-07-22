import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { purge, register, reset, size, teardown } from './storeRegistry';

describe('storeRegistry', () => {
  beforeEach(() => {
    reset();
  });

  it('registers and unregisters entries', () => {
    const unregister = register({
      name: 'test',
      teardown: () => {},
    });

    expect(size()).toBe(1);
    unregister();
    expect(size()).toBe(0);
  });

  it('teardown invokes every registered handler with the previous brandId and a default event', () => {
    const a = mock(() => {});
    const b = mock(() => {});
    register({ name: 'a', teardown: a });
    register({ name: 'b', teardown: b });

    teardown('brand-prev');

    const defaultEvent = {
      prevBrandId: 'brand-prev',
      nextBrandId: null,
      reason: 'local-switch',
    };
    expect(a).toHaveBeenCalledWith('brand-prev', defaultEvent);
    expect(b).toHaveBeenCalledWith('brand-prev', defaultEvent);
  });

  it('teardown is a no-op when prevBrandId is empty', () => {
    const handler = mock(() => {});
    register({ name: 'x', teardown: handler });

    teardown('');

    expect(handler).not.toHaveBeenCalled();
  });

  it('teardown continues after a handler throws', () => {
    const okHandler = mock(() => {});
    register({
      name: 'throws',
      teardown: () => {
        throw new Error('nope');
      },
    });
    register({ name: 'ok', teardown: okHandler });

    expect(() => teardown('brand-prev')).not.toThrow();
    expect(okHandler).toHaveBeenCalledWith('brand-prev', {
      prevBrandId: 'brand-prev',
      nextBrandId: null,
      reason: 'local-switch',
    });
  });

  it('purge only invokes entries that defined a purge handler', () => {
    const purgeA = mock(() => {});
    register({ name: 'a', teardown: () => {}, purge: purgeA });
    register({ name: 'b', teardown: () => {} });

    purge('brand-prev');

    expect(purgeA).toHaveBeenCalledWith('brand-prev');
  });
});
