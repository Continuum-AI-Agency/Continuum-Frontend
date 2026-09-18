// Analytics loads after hydration (see instrumentation-client.ts), which leaves a
// window where posthog's `capture_exceptions` is not yet listening. Anything thrown
// in that window is held here and replayed once the client arrives, so deferring the
// library changes WHEN analytics loads, not whether a crash is reported.

export type ExceptionSink = {
  captureException: (error: unknown, properties?: Record<string, unknown>) => void;
};

type BufferedError = { error: unknown; source: 'error' | 'unhandledrejection' };

export type EarlyErrorBuffer = {
  /** Replay everything captured so far, then stop listening. */
  flushTo: (sink: ExceptionSink) => void;
  /** Stop listening without replaying (the client never loaded). */
  stop: () => void;
  readonly size: number;
};

export function bufferEarlyErrors(target: EventTarget): EarlyErrorBuffer {
  const buffered: BufferedError[] = [];

  const onError = (event: Event) => {
    const { error, message } = event as ErrorEvent;
    buffered.push({ error: error ?? message, source: 'error' });
  };
  const onRejection = (event: Event) => {
    buffered.push({ error: (event as PromiseRejectionEvent).reason, source: 'unhandledrejection' });
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);

  const stop = () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };

  return {
    stop,
    get size() {
      return buffered.length;
    },
    flushTo(sink) {
      stop();
      for (const entry of buffered.splice(0)) {
        sink.captureException(entry.error, {
          buffered_before_init: true,
          source: entry.source,
        });
      }
    },
  };
}
