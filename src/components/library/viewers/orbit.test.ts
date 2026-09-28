import { describe, expect, test } from 'bun:test';
import {
  cameraPositionFromOrbit,
  interpolateOrbit,
  normalizeAzimuth,
  orbitFromCamera,
  orbitsMatch,
  shortestAzimuthDelta,
} from './orbit';

const origin = { x: 0, y: 0, z: 0 };

describe('normalizeAzimuth', () => {
  test('folds into (-180, 180]', () => {
    expect(normalizeAzimuth(0)).toBe(0);
    expect(normalizeAzimuth(180)).toBe(180);
    expect(normalizeAzimuth(-180)).toBe(180);
    expect(normalizeAzimuth(190)).toBe(-170);
    expect(normalizeAzimuth(-190)).toBe(170);
    expect(normalizeAzimuth(720 + 45)).toBe(45);
  });
});

describe('orbitFromCamera', () => {
  test('reads the OrbitControls convention: +Z is azimuth 0, +X is 90, +Y is the pole', () => {
    expect(orbitFromCamera({ x: 0, y: 0, z: 5 }, origin)).toEqual({
      azimuthDeg: 0,
      polarDeg: 90,
      distance: 5,
    });
    const east = orbitFromCamera({ x: 3, y: 0, z: 0 }, origin);
    expect(east.azimuthDeg).toBeCloseTo(90, 9);
    expect(east.polarDeg).toBeCloseTo(90, 9);
    expect(orbitFromCamera({ x: 0, y: 2, z: 0 }, origin).polarDeg).toBe(0);
    expect(orbitFromCamera({ x: 0, y: -2, z: 0 }, origin).polarDeg).toBe(180);
  });

  test('measures around the target, not the world origin', () => {
    const orbit = orbitFromCamera({ x: 10, y: 14, z: 3 }, { x: 10, y: 10, z: 0 });
    expect(orbit.distance).toBeCloseTo(5, 9);
    expect(orbit.azimuthDeg).toBeCloseTo(0, 9);
    expect(orbit.polarDeg).toBeCloseTo((Math.acos(4 / 5) * 180) / Math.PI, 9);
  });

  test('straight behind reads as +180, never -180', () => {
    expect(orbitFromCamera({ x: -0, y: 0, z: -4 }, origin).azimuthDeg).toBe(180);
  });

  test('a camera on its target is a zero orbit, not NaN', () => {
    expect(orbitFromCamera(origin, origin)).toEqual({ azimuthDeg: 0, polarDeg: 0, distance: 0 });
  });
});

describe('cameraPositionFromOrbit', () => {
  test('round-trips through orbitFromCamera', () => {
    const target = { x: 1, y: -2, z: 0.5 };
    for (const azimuthDeg of [-179, -90, -12.5, 0, 45, 135, 180]) {
      for (const polarDeg of [1, 30, 90, 150, 179]) {
        const orbit = { azimuthDeg, polarDeg, distance: 7.25 };
        const back = orbitFromCamera(cameraPositionFromOrbit(orbit, target), target);
        expect(back.azimuthDeg).toBeCloseTo(azimuthDeg, 6);
        expect(back.polarDeg).toBeCloseTo(polarDeg, 6);
        expect(back.distance).toBeCloseTo(7.25, 9);
      }
    }
  });

  test('the poles sit on the Y axis whatever the azimuth', () => {
    const top = cameraPositionFromOrbit({ azimuthDeg: 73, polarDeg: 0, distance: 3 }, origin);
    expect(top.x).toBeCloseTo(0, 12);
    expect(top.y).toBeCloseTo(3, 12);
    expect(top.z).toBeCloseTo(0, 12);
    const bottom = cameraPositionFromOrbit({ azimuthDeg: -40, polarDeg: 180, distance: 3 }, origin);
    expect(bottom.y).toBeCloseTo(-3, 12);
    expect(orbitFromCamera(bottom, origin).polarDeg).toBeCloseTo(180, 9);
  });
});

describe('shortestAzimuthDelta', () => {
  test('turns the short way across the ±180 seam', () => {
    expect(shortestAzimuthDelta(170, -170)).toBe(20);
    expect(shortestAzimuthDelta(-170, 170)).toBe(-20);
    expect(shortestAzimuthDelta(10, 30)).toBe(20);
    expect(shortestAzimuthDelta(0, 180)).toBe(180);
  });
});

describe('orbitsMatch', () => {
  test('matches within the tolerance and wraps azimuth', () => {
    expect(
      orbitsMatch({ azimuthDeg: 179, polarDeg: 60 }, { azimuthDeg: -179.5, polarDeg: 61 }),
    ).toBe(true);
    expect(orbitsMatch({ azimuthDeg: 10, polarDeg: 60 }, { azimuthDeg: 12, polarDeg: 62 })).toBe(
      true,
    );
  });

  test('rejects either angle past the tolerance', () => {
    expect(orbitsMatch({ azimuthDeg: 10, polarDeg: 60 }, { azimuthDeg: 12.5, polarDeg: 60 })).toBe(
      false,
    );
    expect(orbitsMatch({ azimuthDeg: 10, polarDeg: 60 }, { azimuthDeg: 10, polarDeg: 63 })).toBe(
      false,
    );
    expect(orbitsMatch({ azimuthDeg: 10, polarDeg: 60 }, { azimuthDeg: 14, polarDeg: 60 }, 5)).toBe(
      true,
    );
  });
});

describe('interpolateOrbit', () => {
  const from = { azimuthDeg: 170, polarDeg: 40, distance: 2 };
  const to = { azimuthDeg: -170, polarDeg: 80, distance: 6 };

  test('lands exactly on both ends', () => {
    expect(interpolateOrbit(from, to, 0)).toEqual(from);
    expect(interpolateOrbit(from, to, 1)).toEqual(to);
  });

  test('crosses the seam instead of sweeping the long way round', () => {
    expect(interpolateOrbit(from, to, 0.5)).toEqual({ azimuthDeg: 180, polarDeg: 60, distance: 4 });
    expect(interpolateOrbit(from, to, 0.75).azimuthDeg).toBeCloseTo(-175, 9);
  });
});
