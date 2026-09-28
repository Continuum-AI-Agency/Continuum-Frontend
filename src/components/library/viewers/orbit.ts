// Where a camera sits around the point it looks at, in the spherical convention three's
// OrbitControls uses (Y up, azimuth = atan2(x, z), polar measured down from +Y), so an
// orbit read here and an orbit the controls produce are the same numbers. Plain numbers
// keep it testable without a WebGL context.

export type Vec3 = { x: number; y: number; z: number };
export type OrbitAngles = { azimuthDeg: number; polarDeg: number };
export type Orbit = OrbitAngles & { distance: number };

const DEG_PER_RAD = 180 / Math.PI;

/** Folds any angle into (-180, 180]. */
export function normalizeAzimuth(deg: number): number {
  const folded = ((deg % 360) + 360) % 360;
  return folded > 180 ? folded - 360 : folded;
}

/** The signed turn, at most half a circle, that takes `from` to `to`. */
export function shortestAzimuthDelta(fromDeg: number, toDeg: number): number {
  return normalizeAzimuth(toDeg - fromDeg);
}

export function orbitFromCamera(position: Vec3, target: Vec3): Orbit {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance === 0) return { azimuthDeg: 0, polarDeg: 0, distance: 0 };
  const cosPolar = Math.min(1, Math.max(-1, dy / distance));
  return {
    azimuthDeg: normalizeAzimuth(Math.atan2(dx, dz) * DEG_PER_RAD),
    polarDeg: Math.acos(cosPolar) * DEG_PER_RAD,
    distance,
  };
}

export function cameraPositionFromOrbit(orbit: Orbit, target: Vec3): Vec3 {
  const azimuth = orbit.azimuthDeg / DEG_PER_RAD;
  const polar = orbit.polarDeg / DEG_PER_RAD;
  const ring = orbit.distance * Math.sin(polar);
  return {
    x: target.x + ring * Math.sin(azimuth),
    y: target.y + orbit.distance * Math.cos(polar),
    z: target.z + ring * Math.cos(azimuth),
  };
}

/** Same view within `toleranceDeg` on both angles; azimuth wraps at ±180. */
export function orbitsMatch(a: OrbitAngles, b: OrbitAngles, toleranceDeg = 2): boolean {
  return (
    Math.abs(shortestAzimuthDelta(a.azimuthDeg, b.azimuthDeg)) <= toleranceDeg &&
    Math.abs(a.polarDeg - b.polarDeg) <= toleranceDeg
  );
}

/** The orbit `t` (0..1) of the way from `from` to `to`, turning the short way round. */
export function interpolateOrbit(from: Orbit, to: Orbit, t: number): Orbit {
  return {
    azimuthDeg: normalizeAzimuth(
      from.azimuthDeg + shortestAzimuthDelta(from.azimuthDeg, to.azimuthDeg) * t,
    ),
    polarDeg: from.polarDeg + (to.polarDeg - from.polarDeg) * t,
    distance: from.distance + (to.distance - from.distance) * t,
  };
}
