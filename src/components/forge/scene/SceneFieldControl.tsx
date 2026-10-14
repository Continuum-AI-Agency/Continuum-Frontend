'use client';

import type { BlendField, BlendVector3 } from '@continuum/contracts';
import { DefaultValueControl } from '@/components/forge/VariableEditor';
import { NumberScrubField } from '@/components/ui/number-field';
import type { TemplateVariable } from '@/lib/library/templateSources';
import type { SceneValue } from './sceneEditorReducer';
import { Vector3Field } from './Vector3Field';

// One Blender field's control. Text, boolean, colour and image reuse the Forge variable editor's
// value control through a neutral `TemplateVariable`, so a scene picks a Library image or a brand
// colour exactly the way an After Effects template does.
//
// Numbers and vectors take the scrub field instead: the variable editor's number box answers an
// emptied box with null ("no default"), which here would snap the field back to the file's value
// mid-edit — and a 3D number (energy, lens, ortho scale) is one a person wants to drag anyway.

/** A `TemplateVariable` with every AE-only property neutral: no role, budget, comps or clip. */
export function sceneVariable(field: BlendField, label: string): TemplateVariable {
  return {
    key: field.key,
    label,
    kind: field.kind,
    required: false,
    multiple: false,
    accept: [],
    options: [],
    description: null,
    reserved: false,
    role: null,
    roleSource: null,
    charBudget: null,
    comps: [],
    sample: null,
    placement: null,
    clip: null,
    exposed: field.exposed,
  };
}

const isPin = (value: unknown): value is { assetId: string; versionId?: string } =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { assetId?: unknown }).assetId === 'string';

/**
 * What the variable control handed back, as a scene value. Null means "back to the file's value"
 * — except for text, where an emptied box is an empty headline, not a reset that refills it.
 */
export function sceneValueFromControl(kind: BlendField['kind'], next: unknown): SceneValue | null {
  switch (kind) {
    case 'text':
      return typeof next === 'string' ? next : '';
    case 'boolean':
      return typeof next === 'boolean' ? next : null;
    case 'color':
      return typeof next === 'string' && next ? next : null;
    case 'image':
      return isPin(next) ? next : null;
    default:
      // Numbers and vectors never reach the variable control.
      return null;
  }
}

const NUMBER_SUFFIX: Partial<Record<BlendField['target']['path'], string>> = {
  'camera.lens': 'mm',
  'light.energy': 'W',
};

/**
 * The renderer refuses a lens under 1 mm and an ortho scale that is not positive; clamping here
 * keeps a scrub from producing a draft that can only fail.
 */
const NUMBER_MIN: Partial<Record<BlendField['target']['path'], number>> = {
  'camera.lens': 1,
  'camera.ortho_scale': 0.001,
};

const VECTOR_STEP: Partial<Record<BlendField['target']['path'], number>> = {
  'transform.scale': 0.05,
};

export function SceneFieldControl({
  brandId,
  field,
  label,
  value,
  onChange,
}: {
  brandId: string;
  field: BlendField;
  /** The accessible name; every control inside says it. */
  label: string;
  /** The value on screen: the change when there is one, else the file's default. */
  value: SceneValue | null;
  /** Null resets the field to the file's value. */
  onChange: (next: SceneValue | null) => void;
}) {
  if (field.kind === 'vector3') {
    return (
      <Vector3Field
        label={label}
        value={Array.isArray(value) ? (value as BlendVector3) : [0, 0, 0]}
        rotation={field.target.path === 'transform.rotation'}
        step={VECTOR_STEP[field.target.path]}
        onChange={onChange}
      />
    );
  }
  if (field.kind === 'number') {
    return (
      <NumberScrubField
        label="Value"
        ariaLabel={label}
        step={0.1}
        suffix={NUMBER_SUFFIX[field.target.path]}
        min={NUMBER_MIN[field.target.path]}
        value={typeof value === 'number' ? value : 0}
        onChange={onChange}
      />
    );
  }
  return (
    <DefaultValueControl
      variable={sceneVariable(field, label)}
      label={label}
      brandId={brandId}
      // An image's file value is a path inside the .blend, not a Library pin: the control shows
      // "Pick from Library" until a pin replaces it.
      value={field.kind === 'image' && !isPin(value) ? null : value}
      onChange={(next) => onChange(sceneValueFromControl(field.kind, next))}
    />
  );
}
