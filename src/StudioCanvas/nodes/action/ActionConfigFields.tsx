// The knobs for whatever op the node is set to, drawn from `configFieldsFor` descriptors.
// No per-op branch here either: a new op with a new config schema gets its controls for
// free, and an op whose schema grows a key gets the extra control on the next render.

import type { ActionId } from '@continuum/contracts';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { useNodeConfigPatch } from '../../hooks/useNodeConfigPatch';
import {
  type ConfigField,
  configFieldsFor,
  type NumberConfigField,
  numericControlFor,
  parseActionConfig,
} from '../../utils/actions/actionConfig';
import { isOverlayActionId } from '../../utils/actions/overlayOp';
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
  const fields = configFieldsFor(actionId);
  // The op's defaults merged over what is stored, so an unconfigured node shows the
  // values the runner will actually use rather than empty controls.
  const current = parseActionConfig(actionId, config);

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
