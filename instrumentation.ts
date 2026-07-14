import type { Instrumentation } from 'next';

/**
 * The OpenTelemetry SDK is Node-only. Importing it dynamically, behind the runtime check, keeps it
 * out of any edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const [{ registerOtelLogs }, { warmFlushScheduler }] = await Promise.all([
    import('@/lib/observability/otelLogs'),
    import('@/lib/observability/flushScheduler'),
  ]);

  registerOtelLogs();
  await warmFlushScheduler();
}

/**
 * Fires for every unhandled server error — route handlers, Server Actions, and RSC renders alike —
 * which is what gets the whole app into PostHog Logs without touching a single call site.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { log, flushLogs } = await import('@/lib/observability/logger');

  log.error('server request error', error, {
    'http.method': request.method,
    'http.route': context.routePath,
    'next.router_kind': context.routerKind,
    'next.route_type': context.routeType,
    'next.render_source': context.renderSource,
    'next.revalidate_reason': context.revalidateReason,
    'url.path': request.path,
  });

  // There is no `after` scope here, so the scheduled flush cannot run — own it explicitly.
  await flushLogs();
};
