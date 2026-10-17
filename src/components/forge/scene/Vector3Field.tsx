'use client';

import type { BlendVector3 } from '@continuum/contracts';
import { NumberScrubField } from '@/components/ui/number-field';

// X, Y and Z of a location, rotation or scale. Blender stores rotation in radians; a person thinks
// in degrees, so the field shows degrees and writes radians. Only the axis that moved is converted
// back — the other two keep their stored bits rather than drifting through a degrees round-trip.

const AXES = ['X', 'Y', 'Z'] as const;
const DEGREES_PER_RADIAN = 180 / Math.PI;

export const toDegrees = (radians: number) => radians * DEGREES_PER_RADIAN;
export const toRadians = (degrees: number) => degrees / DEGREES_PER_RADIAN;

export function Vector3Field({
  label,
  value,
  rotation = false,
  step,
  onChange,
}: {
  /** Names the vector; each axis reads "<label> X". */
  label: string;
  value: BlendVector3;
  /** Stored in radians, shown in degrees. */
  rotation?: boolean;
  step?: number;
  onChange: (next: BlendVector3) => void;
}) {
  return (
    <fieldset aria-label={label} className="m-0 grid grid-cols-3 gap-1 border-0 p-0">
      {AXES.map((axis, index) => (
        <NumberScrubField
          key={axis}
          label={axis}
          ariaLabel={`${label} ${axis}`}
          orientation="stack"
          step={step ?? (rotation ? 1 : 0.1)}
          suffix={rotation ? '°' : undefined}
          value={rotation ? toDegrees(value[index] ?? 0) : value[index]}
          onChange={(next) => {
            const updated: BlendVector3 = [value[0], value[1], value[2]];
            updated[index] = rotation ? toRadians(next) : next;
            onChange(updated);
          }}
        />
      ))}
    </fieldset>
  );
}
