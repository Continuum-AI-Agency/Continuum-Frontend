// Loose shims: topojson-client ships no types, and typing the world-atlas JSON
// as a literal would bloat tsc. We only use the minimal surface below.
declare module 'topojson-client' {
  import type { GeometryObject } from 'geojson';
  export function feature(
    topology: unknown,
    object: unknown,
  ): import('geojson').FeatureCollection<GeometryObject, Record<string, unknown>>;
}

declare module 'world-atlas/countries-110m.json' {
  const topology: unknown;
  export default topology;
}
