import { describe, expect, it, mock } from 'bun:test';
import type { Logger, LogRecord } from '@opentelemetry/api-logs';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { createLog, type LogSink } from './logger';

function harness() {
  const emitted: LogRecord[] = [];
  const logger = { emit: (record: LogRecord) => void emitted.push(record) } as Logger;
  const sink: LogSink = {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
  const scheduleFlush = mock(() => {});

  const log = createLog({ getLogger: () => logger, scheduleFlush, sink });

  return { log, emitted, sink, scheduleFlush };
}

describe('createLog', () => {
  it('maps each level to its OpenTelemetry severity', () => {
    const { log, emitted } = harness();

    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    expect(emitted.map((record) => record.severityNumber)).toEqual([
      SeverityNumber.DEBUG,
      SeverityNumber.INFO,
      SeverityNumber.WARN,
      SeverityNumber.ERROR,
    ]);
    expect(emitted.map((record) => record.severityText)).toEqual([
      'DEBUG',
      'INFO',
      'WARN',
      'ERROR',
    ]);
    expect(emitted.map((record) => record.body)).toEqual(['d', 'i', 'w', 'e']);
  });

  it('mirrors to the matching console method', () => {
    const { log, sink } = harness();

    log.warn('careful', { brandId: 'b1' });

    expect(sink.warn).toHaveBeenCalledWith('careful', { brandId: 'b1' });
    expect(sink.error).not.toHaveBeenCalled();
  });

  it('schedules a flush after every emit, because a frozen instance never exports', () => {
    const { log, scheduleFlush } = harness();

    log.info('one');
    log.info('two');

    expect(scheduleFlush).toHaveBeenCalledTimes(2);
  });

  it('unpacks an Error into type, message and stack', () => {
    const { log, emitted } = harness();
    const error = new TypeError('bad shape');

    log.error('failed', error);

    expect(emitted[0].attributes).toMatchObject({
      'error.type': 'TypeError',
      'error.message': 'bad shape',
    });
    expect(emitted[0].attributes?.['error.stack']).toContain('bad shape');
  });

  it("carries React's digest, the only link from a client error back to its server log", () => {
    const { log, emitted } = harness();
    const error = Object.assign(new Error('boom'), { digest: '2481725348' });

    log.error('failed', error);

    expect(emitted[0].attributes?.['error.digest']).toBe('2481725348');
  });

  it('handles a thrown non-Error', () => {
    const { log, emitted } = harness();

    log.error('failed', 'just a string');

    expect(emitted[0].attributes).toMatchObject({
      'error.type': 'string',
      'error.message': '"just a string"',
    });
  });

  it('emits no error attributes when no error is passed', () => {
    const { log, emitted } = harness();

    log.error('failed with no cause');

    expect(emitted[0].attributes).toEqual({});
  });

  it('passes primitives and primitive arrays through untouched', () => {
    const { log, emitted } = harness();

    log.info('ctx', { count: 3, ok: true, name: 'organic', ids: ['a', 'b'] });

    expect(emitted[0].attributes).toEqual({
      count: 3,
      ok: true,
      name: 'organic',
      ids: ['a', 'b'],
    });
  });

  it('stringifies non-primitives, which OpenTelemetry would otherwise drop', () => {
    const { log, emitted } = harness();

    log.info('ctx', { payload: { nested: 1 } });

    expect(emitted[0].attributes?.payload).toBe('{"nested":1}');
  });

  it('survives a circular attribute instead of throwing inside the logger', () => {
    const { log, emitted } = harness();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => log.info('ctx', { circular })).not.toThrow();
    expect(typeof emitted[0].attributes?.circular).toBe('string');
  });

  it('drops null and undefined rather than emitting empty attributes', () => {
    const { log, emitted } = harness();

    log.info('ctx', { missing: undefined, empty: null, kept: 'yes' });

    expect(emitted[0].attributes).toEqual({ kept: 'yes' });
  });
});
