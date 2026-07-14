import { type LogAttributes, type Logger, logs, SeverityNumber } from '@opentelemetry/api-logs';
import { scheduleFlush } from './flushScheduler';
import { flushLogs, SERVICE_NAME } from './otelLogs';

export { flushLogs };

export type LogContext = Record<string, unknown>;

type Level = 'debug' | 'info' | 'warn' | 'error';

const SEVERITY: Record<Level, { number: SeverityNumber; text: string }> = {
  debug: { number: SeverityNumber.DEBUG, text: 'DEBUG' },
  info: { number: SeverityNumber.INFO, text: 'INFO' },
  warn: { number: SeverityNumber.WARN, text: 'WARN' },
  error: { number: SeverityNumber.ERROR, text: 'ERROR' },
};

export type LogSink = Pick<Console, Level>;

export type CreateLogOptions = {
  getLogger?: () => Logger;
  scheduleFlush?: () => void;
  sink?: LogSink;
};

export type Log = {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
};

function isPrimitive(value: unknown): value is string | number | boolean {
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean';
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** OpenTelemetry only accepts primitives and primitive arrays; anything else is dropped silently. */
function toAttributes(context: LogContext): LogAttributes {
  const attributes: LogAttributes = {};

  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null) continue;
    if (isPrimitive(value)) {
      attributes[key] = value;
    } else if (Array.isArray(value) && value.every(isPrimitive)) {
      attributes[key] = value;
    } else {
      attributes[key] = stringify(value);
    }
  }

  return attributes;
}

function errorAttributes(error: unknown): LogAttributes {
  if (!(error instanceof Error)) {
    return { 'error.type': typeof error, 'error.message': stringify(error) };
  }

  // React stamps a `digest` on server errors it has already handled; it is the only way to tie a
  // client-visible error back to its server log.
  const { digest } = error as Error & { digest?: unknown };

  return {
    'error.type': error.name,
    'error.message': error.message,
    ...(error.stack ? { 'error.stack': error.stack } : {}),
    ...(typeof digest === 'string' ? { 'error.digest': digest } : {}),
  };
}

/**
 * Mirrors every record to the console — that keeps Vercel's runtime logs and local dev intact —
 * and emits it to OpenTelemetry, which is a no-op until `registerOtelLogs()` publishes a provider.
 */
export function createLog(options: CreateLogOptions = {}): Log {
  const getLogger = options.getLogger ?? (() => logs.getLogger(SERVICE_NAME));
  const schedule = options.scheduleFlush ?? scheduleFlush;
  const sink = options.sink ?? console;

  function emit(level: Level, message: string, error: unknown, context: LogContext): void {
    const attributes: LogAttributes = {
      ...toAttributes(context),
      ...(error === undefined ? {} : errorAttributes(error)),
    };

    const consoleArgs: unknown[] = [message];
    if (error !== undefined) consoleArgs.push(error);
    if (Object.keys(context).length > 0) consoleArgs.push(context);
    sink[level](...consoleArgs);

    getLogger().emit({
      body: message,
      severityNumber: SEVERITY[level].number,
      severityText: SEVERITY[level].text,
      attributes,
    });

    schedule();
  }

  return {
    debug: (message, context = {}) => emit('debug', message, undefined, context),
    info: (message, context = {}) => emit('info', message, undefined, context),
    warn: (message, context = {}) => emit('warn', message, undefined, context),
    error: (message, error, context = {}) => emit('error', message, error, context),
  };
}

export const log = createLog();
