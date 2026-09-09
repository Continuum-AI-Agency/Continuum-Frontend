// Scalar knobs are drawn from `configFieldsFor` descriptors. Structured configs that
// cannot be represented by one primitive field route to a focused panel below.

import type { ActionId, ShaderEffectV1, ShaderStackV1 } from '@continuum/contracts';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberScrubField } from '@/components/ui/number-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SliderField } from '@/components/ui/slider-field';
import { Switch } from '@/components/ui/switch';
import { ShaderEffectControls } from '../../components/ShaderEffectControls';
import { useNodeConfigPatch } from '../../hooks/useNodeConfigPatch';
import {
  type ConfigField,
  configFieldsFor,
  type NumberConfigField,
  numericControlFor,
  parseActionConfig,
} from '../../utils/actions/actionConfig';
import { isOverlayActionId } from '../../utils/actions/overlayOp';
import type { ClipEffectSpec } from '../../utils/render/effectSpec';
import { BurnInConfig } from './BurnInConfig';
import { OverlayConfig } from './OverlayConfig';
import { SubtitlesConfig } from './SubtitlesConfig';

/** Clears a `nullable` field back to null. `null` means "no window"/"auto" and is NOT
 *  0 or the empty string — five registry fields default to it (`video.subtitles`'s
 *  language, and `startSec`/`endSec` on `video.overlay` and `video.watermark`), so the
 *  UI needs a way to say "unset" that a numeric input cannot express. */
function ClearFieldButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={`Clear ${label}`}
      title="Auto"
      onClick={onClear}
    >
      <X className="size-3" />
    </Button>
  );
}

function ConfigControl({
  field,
  value,
  controlId,
  onChange,
}: {
  // Numbers never reach here: `NumericField` takes them, because a draggable control
  // owns its own label and this one does not.
  field: Exclude<ConfigField, { kind: 'number' }>;
  value: unknown;
  controlId: string;
  onChange: (next: unknown) => void;
}) {
  if (field.kind === 'custom') return null;
  if (field.kind === 'boolean') {
    return (
      <Switch
        id={controlId}
        checked={value === true}
        onCheckedChange={(checked) => onChange(checked)}
      />
    );
  }

  if (field.kind === 'enum') {
    return (
      <div className="flex items-center gap-1">
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(next: string) => onChange(next)}
        >
          <SelectTrigger id={controlId} size="sm" className="h-7 flex-1 text-xs">
            <SelectValue placeholder={field.nullable ? 'Auto' : undefined} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.nullable ? (
          <ClearFieldButton label={field.label} onClear={() => onChange(null)} />
        ) : null}
      </div>
    );
  }

  if (field.kind === 'color') {
    return (
      <div className="flex items-center gap-1">
        <ColorField
          id={controlId}
          label={field.label}
          value={typeof value === 'string' ? value : null}
          onChange={onChange}
        />
        {field.nullable ? (
          <ClearFieldButton label={field.label} onClear={() => onChange(null)} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        id={controlId}
        className="h-7 flex-1 text-xs"
        type="text"
        placeholder={field.nullable ? 'Auto' : undefined}
        value={(value as string | null) ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.nullable ? (
        <ClearFieldButton label={field.label} onClear={() => onChange(null)} />
      ) : null}
    </div>
  );
}

/**
 * Numbers get a control you can drag, never a bare box you must type into. Which one
 * is `numericControlFor`'s call, not a per-op list: a range a drag can resolve gets
 * the slider, anything else gets the scrub field.
 *
 * Both own their own label — the slider pairs it with a live readout, the scrub field
 * makes it the drag handle — so this returns the whole field rather than just a control.
 */
function NumericField({
  field,
  value,
  onChange,
}: {
  field: NumberConfigField;
  value: unknown;
  onChange: (next: number | null) => void;
}) {
  const current = typeof value === 'number' ? value : field.defaultValue;

  if (numericControlFor(field) === 'slider' && field.min !== undefined && field.max !== undefined) {
    return (
      <SliderField
        label={field.label}
        max={field.max}
        min={field.min}
        step={field.step}
        value={current ?? field.min}
        onChange={onChange}
      />
    );
  }

  // Split on `nullable` so the callback type follows it: a field that can be unset
  // hands back null and needs the clear button, one that cannot does neither.
  if (field.nullable) {
    return (
      <div className="flex items-end gap-1">
        <NumberScrubField
          className="flex-1"
          label={field.label}
          max={field.max}
          min={field.min}
          nullable
          step={field.step}
          value={current}
          onChange={onChange}
        />
        <ClearFieldButton label={field.label} onClear={() => onChange(null)} />
      </div>
    );
  }

  return (
    <NumberScrubField
      label={field.label}
      max={field.max}
      min={field.min}
      step={field.step}
      value={current ?? undefined}
      onChange={onChange}
    />
  );
}

/**
 * Config keys a mode does not read, per op.
 *
 * `video.extractFrames` is a discriminated union in all but name: `mode: 'single'` takes
 * ONE frame at `atSec` and ignores `count` entirely, which is how a request for 5 frames
 * came back with 1 (Airtable #292). The contract is right — the panel was wrong to offer a
 * knob the runner never reads. The lists mirror `planFrameTimes` in
 * `utils/actions/extractFrames.ts`; that function is the authority on what a mode consumes.
 */
const CONFIG_MODE_GATES: Partial<
  Record<ActionId, { discriminator: string; reads: Readonly<Record<string, readonly string[]>> }>
> = {
  'video.extractFrames': {
    discriminator: 'mode',
    reads: {
      single: ['atSec'],
      evenly: ['count'],
      interval: ['intervalSec'],
      sceneChange: ['threshold'],
    },
  },
};

/** Drops the fields the current mode ignores. The discriminator itself always stays, and
 *  an op with no gate — or a mode the map does not know — keeps every field. */
function fieldsForMode(
  actionId: ActionId,
  fields: ConfigField[],
  config: Record<string, unknown>,
): ConfigField[] {
  const gate = CONFIG_MODE_GATES[actionId];
  if (!gate) return fields;
  const mode = config[gate.discriminator];
  const reads = typeof mode === 'string' ? gate.reads[mode] : undefined;
  if (!reads) return fields;
  return fields.filter((field) => field.key === gate.discriminator || reads.includes(field.key));
}

const numberParameter = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const stringParameter = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** Present the canonical flat stack through the same curated controls used by both editors. */
function shaderControlsEffects(stack: ShaderStackV1): ClipEffectSpec {
  const effects: ClipEffectSpec = {};
  for (const effect of stack.effects) {
    if (!effect.enabled) continue;
    const amount = numberParameter(effect.parameters.amount);
    switch (effect.effectId) {
      case 'chroma_key': {
        const color = stringParameter(effect.parameters.color);
        const tolerance = numberParameter(effect.parameters.tolerance);
        const softness = numberParameter(effect.parameters.softness);
        if (color !== undefined && tolerance !== undefined && softness !== undefined) {
          effects.chromaKey = { color, tolerance, softness };
        }
        break;
      }
      case 'tint': {
        const color = stringParameter(effect.parameters.color);
        if (color !== undefined && amount !== undefined) effects.tint = { color, amount };
        break;
      }
      case 'vignette':
        if (amount !== undefined) effects.vignette = { amount };
        break;
      case 'film_grain':
        if (amount !== undefined) effects.filmGrain = { amount };
        break;
      case 'pixelate': {
        const blockPx = numberParameter(effect.parameters.blockPx);
        if (blockPx !== undefined) effects.pixelate = { blockPx };
        break;
      }
      case 'chromatic_aberration':
        if (amount !== undefined) effects.chromaticAberration = { amount };
        break;
      case 'vhs':
        if (amount !== undefined) effects.vhs = { amount };
        break;
    }
  }
  return effects;
}

function writeShaderEffect(
  stack: ShaderStackV1,
  effectId: ShaderEffectV1['effectId'],
  parameters: ShaderEffectV1['parameters'] | undefined,
): ShaderStackV1 {
  const effects = [...stack.effects];
  const index = effects.findIndex((effect) => effect.effectId === effectId);
  const existing = index >= 0 ? effects[index] : undefined;
  if (!parameters) {
    // Keep a disabled preset's parameters and animation so turning it back on is lossless.
    if (existing) effects[index] = { ...existing, enabled: false };
    return { version: 1, effects };
  }
  const next: ShaderEffectV1 = {
    effectId,
    enabled: true,
    parameters,
    // Parameter edits must not erase animation authored by the agent or another editor.
    keyframes: existing?.keyframes ?? [],
  };
  if (existing) effects[index] = next;
  else effects.push(next);
  return { version: 1, effects };
}

function patchShaderStack(stack: ShaderStackV1, patch: Partial<ClipEffectSpec>): ShaderStackV1 {
  let next = stack;
  if ('chromaKey' in patch) next = writeShaderEffect(next, 'chroma_key', patch.chromaKey);
  if ('tint' in patch) next = writeShaderEffect(next, 'tint', patch.tint);
  if ('vignette' in patch) next = writeShaderEffect(next, 'vignette', patch.vignette);
  if ('filmGrain' in patch) next = writeShaderEffect(next, 'film_grain', patch.filmGrain);
  if ('pixelate' in patch) next = writeShaderEffect(next, 'pixelate', patch.pixelate);
  if ('chromaticAberration' in patch) {
    next = writeShaderEffect(next, 'chromatic_aberration', patch.chromaticAberration);
  }
  if ('vhs' in patch) next = writeShaderEffect(next, 'vhs', patch.vhs);
  return next;
}

function ShaderActionConfig({
  nodeId,
  current,
  onWrite,
}: {
  nodeId: string;
  current: Record<string, unknown>;
  onWrite: (key: string, value: unknown) => void;
}) {
  const stack = current.shaderStack as ShaderStackV1;
  const mode = current.mode === 'bake' ? 'bake' : 'deferred';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`action-config-${nodeId}-mode`} className="text-xs">
          Output
        </Label>
        <Select value={mode} onValueChange={(next: string) => onWrite('mode', next)}>
          <SelectTrigger id={`action-config-${nodeId}-mode`} size="sm" className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deferred">Keep source editable</SelectItem>
            <SelectItem value="bake">Bake into pixels</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-2xs text-muted-foreground">
        Deferred keeps the source reference and effect settings. Bake creates modified pixels now.
      </p>
      <ShaderEffectControls
        idPrefix={`action-${nodeId}`}
        effects={shaderControlsEffects(stack)}
        onChange={(patch) => onWrite('shaderStack', patchShaderStack(stack, patch))}
      />
    </div>
  );
}

/**
 * The op's knobs, with no surface of their own.
 *
 * Rendered BOTH inside the on-node popover and inside the selection inspector's
 * action section — the panel is where node configuration lives (image and video
 * nodes already work that way), and the gear stays for reach-without-selecting.
 * One implementation, so a new registry field appears in both places or neither.
 */
export function ActionConfigFields({
  nodeId,
  actionId,
  config,
}: {
  nodeId: string;
  actionId: ActionId;
  config: Record<string, unknown>;
}) {
  const patch = useNodeConfigPatch();
  // The op's defaults merged over what is stored, so an unconfigured node shows the
  // values the runner will actually use rather than empty controls.
  const current = parseActionConfig(actionId, config);
  const fields = fieldsForMode(actionId, configFieldsFor(actionId), current);

  const write = (key: string, value: unknown) => {
    patch(nodeId, 'action', { config: { ...current, [key]: value } });
  };

  // Body swap only — no early return before useNodeConfigPatch(), because switching a
  // mounted node's op must not change the hook count.
  if (actionId === 'video.subtitles') {
    return <SubtitlesConfig nodeId={nodeId} config={current} onWrite={write} />;
  }
  if (isOverlayActionId(actionId)) {
    return <OverlayConfig nodeId={nodeId} actionId={actionId} config={config} />;
  }
  // Placement is a place on a frame, and ink is a colour. Neither survives contact with the
  // four field kinds above — the attempt is what put design-section enums in the schema.
  if (actionId === 'image.text') {
    return <BurnInConfig nodeId={nodeId} config={config} />;
  }
  if (actionId === 'image.shader' || actionId === 'video.shader') {
    return <ShaderActionConfig nodeId={nodeId} current={current} onWrite={write} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => {
        if (field.kind === 'number') {
          return (
            <NumericField
              key={field.key}
              field={field}
              value={current[field.key]}
              onChange={(next) => write(field.key, next)}
            />
          );
        }
        const controlId = `action-config-${nodeId}-${field.key}`;
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <Label htmlFor={controlId} className="text-xs">
              {field.label}
            </Label>
            <ConfigControl
              field={field}
              value={current[field.key]}
              controlId={controlId}
              onChange={(next) => write(field.key, next)}
            />
          </div>
        );
      })}
    </div>
  );
}
