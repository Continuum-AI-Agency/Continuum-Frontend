// Field timings with the attribution Speed Insights does not carry. Speed Insights already
// reports p75 per route and deployment; these PostHog events say WHICH element was the LCP,
// WHICH interaction was slow and where its time went, and how long a client navigation took
// to paint its destination. Every event carries the route template and the release.
//
// Every page load reports (no sampling): the app's traffic is small enough that a sample
// would leave most routes without a p75. web-vitals reads buffered performance entries, so
// it loads after idle with PostHog without missing the page load's metrics.

export type VitalsSink = {
  capture: (event: string, properties: Record<string, unknown>) => void;
};

type Properties = Record<string, unknown>;

const release = process.env.NEXT_PUBLIC_COMMIT_SHA;
const routes: { at: number; route: string }[] = [];
const pending: [string, Properties][] = [];
let sink: VitalsSink | null = null;
let navigation: { at: number; from: string | null } | null = null;

function capture(event: string, properties: Properties) {
  const withRelease = { ...properties, release };
  if (sink) sink.capture(event, withRelease);
  else pending.push([event, withRelease]);
}

/** The route as it is defined (`/[locale]/library/[id]`), not the URL the person visited. */
export function routeTemplate(pathname: string, params: Record<string, string | string[]>) {
  const names = new Map<string, string>();
  for (const [name, value] of Object.entries(params)) {
    for (const segment of Array.isArray(value) ? value : [value]) names.set(segment, `[${name}]`);
  }
  return pathname
    .split('/')
    .map((segment) => names.get(decodeURIComponent(segment)) ?? segment)
    .join('/');
}

/** The route that was on screen at `time` (ms since navigation start). */
export function routeAt(time: number): string | null {
  let current = routes[0]?.route ?? null;
  for (const entry of routes) if (entry.at <= time) current = entry.route;
  return current;
}

/** Called from `onRouterTransitionStart` (instrumentation-client.ts). */
export function markNavigationStart() {
  navigation = { at: performance.now(), from: routes.at(-1)?.route ?? null };
}

/** Called after every committed route change; closes a navigation once its page has painted. */
export function routeCommitted(route: string) {
  routes.push({ at: performance.now(), route });
  const started = navigation;
  navigation = null;
  if (!started) return;
  requestAnimationFrame(() =>
    setTimeout(() => {
      const paintedAt = performance.now();
      // A navigation that waited on an RSC response was not served from the router cache.
      const waitedOnNetwork = performance
        .getEntriesByType('resource')
        .some(
          (entry) =>
            entry.name.includes('_rsc=') &&
            entry.startTime >= started.at &&
            (entry as PerformanceResourceTiming).responseEnd <= paintedAt,
        );
      capture('navigation_painted', {
        route,
        from_route: started.from,
        duration_ms: Math.round(paintedAt - started.at),
        waited_on_network: waitedOnNetwork,
      });
    }, 0),
  );
}

export async function reportWebVitals(target: VitalsSink) {
  const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import('web-vitals/attribution');
  const base = (metric: {
    name: string;
    value: number;
    rating: string;
    navigationType: string;
  }) => ({
    metric: metric.name,
    // CLS is a unitless score (0.1 is the threshold); the rest are milliseconds.
    value: metric.name === 'CLS' ? Number(metric.value.toFixed(3)) : Math.round(metric.value),
    rating: metric.rating,
    navigation_type: metric.navigationType,
    // The page-load metrics belong to the route the page loaded on.
    route: routes[0]?.route ?? null,
  });

  onLCP((metric) => {
    const a = metric.attribution;
    capture('web_vital', {
      ...base(metric),
      target: a.target,
      resource_url: a.url,
      ttfb_ms: Math.round(a.timeToFirstByte),
      resource_load_delay_ms: Math.round(a.resourceLoadDelay),
      resource_load_duration_ms: Math.round(a.resourceLoadDuration),
      element_render_delay_ms: Math.round(a.elementRenderDelay),
    });
  });
  onINP((metric) => {
    const a = metric.attribution;
    capture('web_vital', {
      ...base(metric),
      // A slow interaction belongs to the route it happened on, not the one the page loaded on.
      route: routeAt(a.interactionTime ?? 0),
      target: a.interactionTarget,
      interaction_type: a.interactionType,
      load_state: a.loadState,
      input_delay_ms: Math.round(a.inputDelay),
      processing_ms: Math.round(a.processingDuration),
      presentation_delay_ms: Math.round(a.presentationDelay),
      longest_script: a.longestScript?.entry.sourceURL,
      longest_script_invoker: a.longestScript?.entry.invoker,
      longest_script_ms: a.longestScript
        ? Math.round(a.longestScript.intersectingDuration)
        : undefined,
    });
  });
  onCLS((metric) => {
    const a = metric.attribution;
    capture('web_vital', {
      ...base(metric),
      target: a.largestShiftTarget,
      largest_shift: a.largestShiftValue,
      load_state: a.loadState,
    });
  });
  onFCP((metric) => capture('web_vital', base(metric)));
  onTTFB((metric) => capture('web_vital', base(metric)));

  sink = target;
  for (const [event, properties] of pending.splice(0)) target.capture(event, properties);
}
